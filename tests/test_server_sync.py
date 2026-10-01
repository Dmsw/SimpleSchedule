import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.app import Application


TASK = dict(id='one', title='论文', details='## 步骤', category='科研', importance=8,
            workload=30, completion=0, deadline='2026-10-01T00:00:00.000Z',
            done=False, detailsMode='markdown', daily=True, dailyResetDate='2026-10-01')


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = Application(Path(self.tmp.name) / 'db.sqlite3', 'https://schedule.test')
        self.app.provision('alice', 'test-password-123')
        self.app.provision('bob', 'other-password-123')

    def tearDown(self):
        self.tmp.cleanup()

    def call(self, method, path, body=None, auth=None, **overrides):
        raw = json.dumps(body).encode() if body is not None else b''
        env = dict(REQUEST_METHOD=method, PATH_INFO=path, CONTENT_TYPE='application/json',
                   CONTENT_LENGTH=str(len(raw)), HTTP_ORIGIN='https://schedule.test',
                   HTTP_X_REQUESTED_WITH='SimpleSchedule', REMOTE_ADDR='127.0.0.1')
        env['wsgi.input'] = io.BytesIO(raw)
        if auth:
            env.update(HTTP_COOKIE=auth['cookie'], HTTP_X_CSRF_TOKEN=auth['csrf'], HTTP_X_SCHEDULE_USER=auth['user']['id'])
        env.update(overrides)
        response = {}
        def start(status, headers):
            response.update(status=int(status.split()[0]), headers=dict(headers))
        data = json.loads(b''.join(self.app(env, start)))
        return response['status'], data, response['headers']

    def login(self, name='alice', password='test-password-123'):
        status, data, headers = self.call('POST', '/api/login', {'username': name, 'password': password})
        self.assertEqual(status, 200)
        for flag in ('Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/'):
            self.assertIn(flag, headers['Set-Cookie'])
        data['cookie'] = headers['Set-Cookie'].split(';')[0]
        return data

    def test_auth_csrf_and_no_registration(self):
        self.assertEqual(self.call('GET', '/api/data')[0], 401)
        self.assertEqual(self.call('POST', '/api/register', {})[0], 404)
        self.assertEqual(self.call('POST', '/api/login', {}, HTTP_ORIGIN='https://evil.test')[0], 403)
        self.assertEqual(self.call('POST', '/api/login', {'username': 'alice', 'password': 'wrong'})[0], 401)
        auth = self.login()
        self.assertEqual(self.call('PUT', '/api/data', {'revision': 0, 'tasks': [TASK]}, auth, HTTP_X_CSRF_TOKEN='wrong')[0], 403)
        self.assertEqual(self.call('POST', '/api/logout', {}, auth)[0], 200)
        self.assertEqual(self.call('GET', '/api/session', auth=auth)[0], 401)

    def test_account_isolation_revisions_delete_and_restart(self):
        alice, bob = self.login(), self.login('bob', 'other-password-123')
        self.assertEqual(self.call('PUT', '/api/data', {'revision': 0, 'tasks': [TASK]}, alice)[1]['revision'], 1)
        self.assertEqual(self.call('GET', '/api/data', auth=bob)[1]['tasks'], [])
        self.assertEqual(self.call('GET', '/api/data', auth=bob, HTTP_X_SCHEDULE_USER=alice['user']['id'])[0], 401)
        self.assertEqual(self.call('PUT', '/api/data', {'revision': 0, 'tasks': []}, alice)[0], 409)
        self.app = Application(self.app.db_path, 'https://schedule.test')
        self.assertEqual(self.call('GET', '/api/data', auth=alice)[1]['tasks'], [TASK])
        self.assertEqual(self.call('PUT', '/api/data', {'revision': 1, 'tasks': []}, alice)[0], 200)
        self.assertEqual(self.call('GET', '/api/data', auth=alice)[1]['tasks'], [])
        self.app.provision('alice', 'new-password-123')
        self.assertEqual(self.call('GET', '/api/session', auth=alice)[0], 401)

    def test_atomic_concurrent_write(self):
        auth = self.login()
        with ThreadPoolExecutor(2) as pool:
            futures = [pool.submit(self.call, 'PUT', '/api/data', {'revision': 0, 'tasks': [TASK | {'title': title}]}, auth) for title in ['A', 'B']]
        self.assertEqual(sorted(f.result()[0] for f in futures), [200, 409])

    def test_validation_and_limits(self):
        auth = self.login()
        for bad in [TASK | {'importance': 11}, TASK | {'done': 1}, TASK | {'workload': 100001}, TASK | {'completion': -1}, TASK | {'completion': 100, 'done': False}, TASK | {'daily': 'yes'}, TASK | {'dailyResetDate': '2026/10/01'}, TASK | {'deadline': 'tomorrow'}, TASK | {'details': '<script>' * 2000}]:
            self.assertEqual(self.call('PUT', '/api/data', {'revision': 0, 'tasks': [bad]}, auth)[0], 400)
        self.assertEqual(self.call('PUT', '/api/data', {}, auth, CONTENT_LENGTH=str(31 * 1024 * 1024))[0], 413)
        self.assertEqual(self.call('GET', '/api/data', auth=auth)[1]['revision'], 0)
        for _ in range(15):
            status = self.call('POST', '/api/login', {'username': 'missing', 'password': 'bad'})[0]
            self.assertEqual(status, 401)
        self.assertEqual(self.call('POST', '/api/login', {'username': 'missing', 'password': 'bad'})[0], 429)


if __name__ == '__main__':
    unittest.main()
