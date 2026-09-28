# WebDAV 多端同步

SimpleSchedule 的 WebDAV 同步保持“本地优先”设计：日程仍保存在浏览器 localStorage，WebDAV 仅用于跨设备同步和恢复。

## 配置

在页面顶部点击 **WebDAV**，填写：

- WebDAV 地址
- 用户名
- 密码或应用专用密码
- 可选的跨域代理地址
- 是否开启自动同步

保存后可先执行连接测试，再进行首次同步。

远端文件固定为：

```
SimpleSchedule/simpleschedule-sync.json
```

## 浏览器跨域限制

纯网页应用直接访问第三方 WebDAV 时会受到浏览器 CORS 限制。

如果 WebDAV 服务端已经允许来自 SimpleSchedule 站点的跨域请求，可以直接连接。

否则需要一个 CORS 代理。当前客户端约定代理形式为：

```
<代理地址>/<完整 WebDAV URL>
```

例如：

```
https://proxy.example.com/https://dav.example.com/path/SimpleSchedule/simpleschedule-sync.json
```

代理必须允许并转发至少这些方法：

- GET
- PUT
- MKCOL

并保留这些请求头：

- Authorization
- Content-Type
- If-Match

还需要把响应中的 ETag 和状态码原样返回，并补充浏览器所需的 CORS 响应头。

## 同步语义

- localStorage 始终是当前设备的本地缓存。
- 本地修改后自动同步会做约 1.8 秒防抖。
- 自动同步开启时，每 30 秒检查一次云端；窗口重新获得焦点时也会检查。
- 同一任务在多个设备修改时按“每任务最后修改时间”合并。
- 删除通过 tombstone 传播，避免旧设备把已删除任务重新带回来。
- 远端支持 ETag 时，会用 If-Match 做乐观并发控制；发现其它设备抢先写入时会重新读取并合并，而不是直接覆盖。
- 首次同步会合并本地和云端，不做单边整体覆盖。

## 安全说明

当前第一版 WebDAV 配置（URL、用户名、密码）保存在当前浏览器 localStorage 中。

因此：

- 建议使用 WebDAV 服务提供的应用专用密码。
- 不建议在公共或不可信设备上保存 WebDAV 凭据。
- AI API Key 不会写入 WebDAV 同步文件。
- 当前版本尚未对云端同步文件做端到端加密；后续可增加 AES-GCM 加密。

## 与 ZhiNote 的关系

本实现仅参考 ZhiNote 的架构思想，例如本地优先、WebDAV、浏览器代理、删除墓碑、冲突保护等；未复制其 AGPL-3.0 源代码。SimpleSchedule 的实现是针对自身数据模型独立编写的较轻量版本。
