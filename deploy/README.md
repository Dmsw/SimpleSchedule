# SimpleSchedule 服务器部署

本项目是纯静态网页，无需 Node.js、Python 或数据库。推荐使用 Nginx 直接托管仓库根目录。

## 1. 克隆仓库

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/Dmsw/SimpleSchedule.git simpleschedule
sudo chown -R $USER:$USER /var/www/simpleschedule
```

网站入口：

```text
/var/www/simpleschedule/index.html
```

## 2. 配置 Nginx

复制 `deploy/nginx.conf.example` 到：

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/simpleschedule
```

编辑域名：

```bash
sudo nano /etc/nginx/sites-available/simpleschedule
```

将 `schedule.example.com` 替换成你的真实域名。

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/simpleschedule /etc/nginx/sites-enabled/simpleschedule
sudo nginx -t
sudo systemctl reload nginx
```

## 3. HTTPS

Ubuntu / Debian 可使用 Certbot：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d schedule.example.com
```

## 4. 更新网站

仓库更新后：

```bash
cd /var/www/simpleschedule
./deploy/update.sh
```

静态文件更新不需要重启 Nginx。

如果 `update.sh` 没有执行权限：

```bash
chmod +x deploy/update.sh
```

## 5. 数据说明

任务和 AI 设置仍保存在访问者浏览器的 localStorage 中，不会自动写入服务器。更换设备或浏览器时需要使用应用内的导出/导入备份功能。
