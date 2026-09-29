"""Small WSGI JSON API. No registration endpoint; provision accounts via CLI."""
import argparse
import getpass
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie, CookieError
from pathlib import Path

MAX_BODY = 30 * 1024 * 1024
SESSION_AGE = 7 * 86400


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384,
                          r=8, p=1, dklen=32).hex()


def validate_tasks(tasks):
    if not isinstance(tasks, list) or len(tasks) > 20000:
        raise APIError(400, '日程列表无效或超过 20000 条')
    ids = set()
    result = []
    for t in tasks:
        if not isinstance(t, dict):
            raise APIError(400, '日程格式无效')
        for key, limit in [('id', 150), ('title', 160), ('details', 10000), ('category', 40), ('deadline', 80)]:
            if not isinstance(t.get(key), str) or len(t[key]) > limit:
                raise APIError(400, '日程文本字段无效')
        if not t['id'] or t['id'] in ids or not t['category'].strip() or (not t['title'].strip() and t.get('draft') is not True):
            raise APIError(400, '日程 ID、标题或类别无效')
        ids.add(t['id'])
        importance = t.get('importance')
        workload = t.get('workload')
        completion = t.get('completion')
        if type(importance) not in (float, int) or not math.isfinite(importance) or not -10 <= importance <= 10:
            raise APIError(400, '日程重要性无效')
        if type(workload) is not int or not 1 <= workload <= 10:
            raise APIError(400, '日程任务量无效')
        if type(completion) is not int or not 0 <= completion <= 100:
            raise APIError(400, '日程完成度无效')
        if type(t.get('done')) is not bool or t.get('detailsMode') not in ('text', 'markdown'):
            raise APIError(400, '日程状态无效')
        if t['done'] != (completion == 100):
            raise APIError(400, '完成状态与完成度不一致')
        try:
            date = datetime.fromisoformat(t['deadline'].replace('Z', '+00:00'))
            if date.tzinfo is None:
                raise ValueError()
        except ValueError:
            raise APIError(400, '截止日期无效')
        result.append({k: t[k] for k in ('id', 'title', 'details', 'category', 'deadline', 'importance', 'workload', 'completion', 'done', 'detailsMode')} | ({'draft': True} if t.get('draft') is True else {}))
    return result


class Application:
    def __init__(self, db_path, origin):
        self.db_path = str(db_path)
        self.origin = origin.rstrip('/')
        if not re.fullmatch(r'https://[^/]+|http://(?:localhost|127\.0\.0\.1)(?::\d+)?', self.origin):
            raise ValueError('SCHEDULE_ORIGIN 必须是 HTTPS 域名，或本机开发地址')
        self.secure = self.origin.startswith('https:')
        self.cookie_name = '__Host-schedule_session' if self.secure else 'schedule_session'
        Path(db_path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self.db()) as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS documents(user_id TEXT PRIMARY KEY REFERENCES users(id), revision INTEGER NOT NULL, tasks TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS history(user_id TEXT NOT NULL, revision INTEGER NOT NULL, tasks TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id,revision));
                CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
            ''')
        os.chmod(self.db_path, 0o600)

    def db(self):
        db = sqlite3.connect(self.db_path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def provision(self, username, password):
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', username) or not 12 <= len(password) <= 1024:
            raise ValueError('用户名须为 1–64 位字母、数字、_ . -；密码至少 12 位')
        salt = secrets.token_hex(16)
        digest = password_hash(password, salt)
        with closing(self.db()) as db:
            db.execute('BEGIN IMMEDIATE')
            user = db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()
            uid = user['id'] if user else secrets.token_hex(16)
            db.execute('INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,password=excluded.password', (uid, username, salt, digest))
            db.execute('INSERT OR IGNORE INTO documents VALUES(?,0,?)', (uid, '[]'))
            db.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
            db.commit()

    def token(self, env):
        try:
            cookie = SimpleCookie(env.get('HTTP_COOKIE', ''))
            value = cookie[self.cookie_name].value if self.cookie_name in cookie else ''
        except CookieError:
            value = ''
        return hashlib.sha256(value.encode()).hexdigest()

    def session(self, db, env):
        session = db.execute('SELECT sessions.*,username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?', (self.token(env), int(time.time()))).fetchone()
        if not session:
            raise APIError(401, '请登录，或登录已过期')
        if env['PATH_INFO'] == '/api/data' and env.get('HTTP_X_SCHEDULE_USER') != session['user_id']:
            raise APIError(401, '账号已切换，请重新登录')
        return session

    def body(self, env):
        try:
            length = int(env.get('CONTENT_LENGTH') or 0)
        except ValueError:
            raise APIError(400, '无效请求长度')
        if length < 0 or length > MAX_BODY:
            raise APIError(413, '请求超过 30 MB')
        if env.get('CONTENT_TYPE', '').split(';')[0] != 'application/json':
            raise APIError(415, '需要 JSON 请求')
        try:
            value = json.loads(env['wsgi.input'].read(length))
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, UnicodeError):
            raise APIError(400, '无效 JSON')

    def cookie(self, value, age):
        return ('Set-Cookie', f'{self.cookie_name}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}' + ('; Secure' if self.secure else ''))

    def dispatch(self, env):
        method, path = env['REQUEST_METHOD'], env['PATH_INFO']
        if (method, path) not in {('POST', '/api/login'), ('POST', '/api/logout'), ('GET', '/api/session'), ('GET', '/api/data'), ('PUT', '/api/data')}:
            raise APIError(404, '接口不存在')
        if method in ('POST', 'PUT') and (env.get('HTTP_ORIGIN') != self.origin or env.get('HTTP_X_REQUESTED_WITH') != 'SimpleSchedule'):
            raise APIError(403, '请求来源无效')
        with closing(self.db()) as db:
            if path == '/api/login':
                data = self.body(env)
                username, password = data.get('username'), data.get('password')
                if not isinstance(username, str) or not isinstance(password, str) or len(username) > 64 or len(password) > 1024:
                    raise APIError(400, '用户名或密码格式无效')
                now = int(time.time())
                # Nginx must overwrite X-Real-IP; the API listens on loopback only.
                ip = env.get('HTTP_X_REAL_IP') or env.get('REMOTE_ADDR', '')
                db.execute('BEGIN IMMEDIATE')
                db.execute('DELETE FROM attempts WHERE expires<=?', (now,))
                db.execute('DELETE FROM sessions WHERE expires<=?', (now,))
                for bucket, limit in [('ip:' + ip, 30), ('user:' + username, 15)]:
                    row = db.execute('SELECT count FROM attempts WHERE bucket=?', (bucket,)).fetchone()
                    if row and row['count'] >= limit:
                        db.rollback()
                        raise APIError(429, '尝试次数过多，请 15 分钟后重试')
                    db.execute('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1', (bucket, now + 900))
                db.commit()
                user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
                digest = password_hash(password, user['salt'] if user else '00' * 16)
                if not user or not hmac.compare_digest(digest, user['password']):
                    raise APIError(401, '用户名或密码错误')
                token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
                db.execute('BEGIN IMMEDIATE')
                db.execute('DELETE FROM sessions WHERE token=?', (self.token(env),))
                db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], csrf, now + SESSION_AGE))
                db.commit()
                return 200, {'user': {'id': user['id'], 'username': username}, 'csrf': csrf}, [self.cookie(token, SESSION_AGE)]
            session = self.session(db, env)
            if method in ('POST', 'PUT') and not hmac.compare_digest(env.get('HTTP_X_CSRF_TOKEN', ''), session['csrf']):
                raise APIError(403, '登录状态已变化，请重新登录')
            if path == '/api/session':
                return 200, {'user': {'id': session['user_id'], 'username': session['username']}, 'csrf': session['csrf']}, []
            if path == '/api/logout':
                db.execute('DELETE FROM sessions WHERE token=?', (self.token(env),))
                return 200, {'ok': True}, [self.cookie('', 0)]
            if method == 'GET':
                row = db.execute('SELECT * FROM documents WHERE user_id=?', (session['user_id'],)).fetchone()
                return 200, {'revision': row['revision'], 'tasks': json.loads(row['tasks'])}, []
            data = self.body(env)
            if type(data.get('revision')) is not int or data['revision'] < 0:
                raise APIError(400, '缺少有效版本号')
            tasks = json.dumps(validate_tasks(data.get('tasks')), ensure_ascii=False, separators=(',', ':'))
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM documents WHERE user_id=?', (session['user_id'],)).fetchone()
            if row['revision'] != data['revision']:
                db.rollback()
                raise APIError(409, '另一台设备已更新日程，请处理同步冲突')
            revision = row['revision'] + 1
            db.execute('INSERT INTO history VALUES(?,?,?,?)', (session['user_id'], row['revision'], row['tasks'], int(time.time())))
            db.execute('DELETE FROM history WHERE user_id=? AND revision<?', (session['user_id'], revision - 20))
            db.execute('UPDATE documents SET revision=?,tasks=? WHERE user_id=?', (revision, tasks, session['user_id']))
            db.commit()
            return 200, {'revision': revision}, []

    def __call__(self, env, start_response):
        try:
            status, data, extra = self.dispatch(env)
        except APIError as error:
            status, data, extra = error.status, {'error': error.message}, []
        except Exception:
            import logging
            logging.exception('Schedule API failure')
            status, data, extra = 500, {'error': '服务器暂时不可用，请稍后重试'}, []
        body = json.dumps(data, ensure_ascii=False).encode()
        start_response(f'{status} {HTTPStatus(status).phrase}', [('Content-Type', 'application/json; charset=utf-8'), ('Content-Length', str(len(body))), ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff')] + extra)
        return [body]


def create_app():
    return Application(os.environ.get('SCHEDULE_DB', '/var/lib/simpleschedule/schedule.sqlite3'),
                       os.environ['SCHEDULE_ORIGIN'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='服务器本机账号管理（无公开注册接口）')
    parser.add_argument('command', choices=['set-password'])
    parser.add_argument('username')
    args = parser.parse_args()
    password = getpass.getpass('密码（至少 12 位）：')
    if password != getpass.getpass('再次输入密码：'):
        parser.error('两次密码不一致')
    create_app().provision(args.username, password)
    print('账号已配置；旧登录已失效。')
