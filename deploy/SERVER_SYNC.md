# 登录与服务器同步

此分支在现有静态地图上新增 `login.html` 登录子页，以及 Python + SQLite 同步 API。首页仍可不登录使用；登录成功后进入 `/?sync=1`，使用账号独立的数据缓存。没有注册页面或注册 API，账号仅由服务器管理员在命令行配置。

## 部署到现有服务器

需要 Python 3.10+。以下按现有目录 `/var/www/simpleschedule`、域名 `www.simpleschedule.site` 和 Ubuntu/Debian 的 `www-data` 用户编写；其他部署修改对应路径、域名及服务用户。不要将数据库放到网站目录。

```bash
cd /var/www/simpleschedule
git fetch origin
git switch feature/server-login-sync
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
sudo install -d -o www-data -g www-data -m 700 /var/lib/simpleschedule
```

创建预先授权的账号，密码交互输入，不写进源码或 shell 历史：

```bash
sudo -u www-data env \
  SCHEDULE_ORIGIN=https://www.simpleschedule.site \
  SCHEDULE_DB=/var/lib/simpleschedule/schedule.sqlite3 \
  .venv/bin/python server/app.py set-password yourname
```

密码至少 12 位。对已有用户名执行相同命令会重置密码、注销该账号已有会话，保留其日程。

启动后台：

```bash
sudo cp deploy/simpleschedule-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now simpleschedule-sync
sudo systemctl status simpleschedule-sync
```

修改服务文件中的 `SCHEDULE_ORIGIN` 为实际访问网站的唯一来源（协议 + 域名 + 可选端口，不带路径），必须与浏览器地址一致。公网只支持 HTTPS；Cookie 默认 Secure、HttpOnly、SameSite=Strict。

在现有 **HTTPS server 块**中加入 `deploy/nginx.conf.example` 的 `/api/` 代理和静态文件规则。**如果已有 Certbot 证书配置，不要用该 HTTP 示例覆盖整个线上配置。** API 只监听 `127.0.0.1:8765`；Nginx 必须覆盖 `X-Real-IP`，用于登录限流。不要将该端口直接暴露公网。

新站点可先使用示例，然后按原部署文档执行 `certbot --nginx -d www.simpleschedule.site`，选择 HTTP 跳转 HTTPS。确认 HTTPS 正常后再登录。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

打开 `https://www.simpleschedule.site/login.html`。登录后点“上传本机日程”，将同一浏览器、同一网站来源中原有本地日程合并到账号并上传。原本地副本保留；`file://`、不同域名或 HTTP 与 HTTPS 的数据不共享，需先导出 JSON，再在登录后的页面导入。

部署更新后重启 API：`sudo systemctl restart simpleschedule-sync`。只更新静态文件无需重启 Nginx。未部署 API 的纯静态网站仍能使用本地日程，但无法登录同步。

## 同步规则

- 修改立即保存到当前账号的本地缓存，约 700 ms 后上传；在线且页面可见时，每 10 秒检查其他设备更新；恢复网络、切回页面也检查。关页前有待上传修改会提醒，关闭页面后不会继续同步。
- 联网成功登录过的同一标签页，临时断网时仍可继续编辑并等待重试。不是 PWA：离线首次打开页面不保证可用。
- 删除、完成状态、批量修改和清空账号日程均参与同步。账号与未登录数据隔离，不自动把另一账号或匿名数据上传。
- 只同步日程，不同步 AI API 密钥、AI 设置和地图视窗位置。账号缓存保留在本浏览器；退出会撤销服务器会话，但不会清除本机缓存，以保留未上传修改。
- 采用整份日程快照 + 服务器原子版本检查。两端分别修改后不会静默覆盖：按钮提示“同步冲突”，选择本机或服务器完整版本；处理前下载包含两份数据的 JSON。该文件顶层是本机备份，可直接导入；`serverBackup` 字段是独立可导入的服务器备份对象。可稍后处理，先导出并人工合并，再选择本机版本。当前没有自动跨设备逐字段合并。
- 编辑表单、标签或拖动期间，不用远端数据替换当前地图。多标签页不相关任务的修改可合并；同一任务同时修改时会暂停保存并提示导出，避免静默覆盖。
- 登录过期或另一标签页切换账号后停止同步，原账号修改仍在本机；点击“重新登录”，登录原账号继续同步。
- SQLite 保存每个账号最新快照和最近 20 个旧版本。请定期用 SQLite 的备份接口备份数据库（不要仅复制运行中的主文件而漏掉 WAL）。例如：

```bash
sudo -u www-data sqlite3 /var/lib/simpleschedule/schedule.sqlite3 ".backup '/var/lib/simpleschedule/backup.sqlite3'"
```

数据库含日程和账号密码哈希，备份应仅供管理员访问。服务器故障或浏览器缓存损坏时，原有导出/导入仍用于恢复；此分支没有管理员网页或密码找回邮件功能。

## 验证

```bash
python3 -m unittest discover -s tests -p 'test_server_sync.py' -v
node tests/server-sync.cjs
```

服务使用标准 WSGI 接口，由 Gunicorn 托管：[官方部署文档](https://gunicorn.org/deploy/)。Python 业务代码仅使用标准库。
