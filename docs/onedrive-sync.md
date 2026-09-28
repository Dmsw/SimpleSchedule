# OneDrive 多端同步配置

SimpleSchedule 的 OneDrive 同步使用 Microsoft OAuth / MSAL 和 Microsoft Graph。浏览器只获得当前登录用户授予的委托权限，不需要 Client Secret。

## Microsoft Entra 应用注册

1. 打开 Microsoft Entra 管理中心，进入 **App registrations → New registration**。
2. 应用名称建议使用 **SimpleSchedule**。
3. Supported account types 选择同时支持组织账号和个人 Microsoft 账号的选项。
4. 在 **Authentication** 中添加 **Single-page application (SPA)** Redirect URI：`https://www.simpleschedule.site/`
5. 在 **API permissions** 中添加 Microsoft Graph 的 delegated permission：`Files.ReadWrite.AppFolder`。
6. 复制 **Application (client) ID**，由站点维护者写入 `assets/js/onedrive-config.js`。普通用户不需要看到或填写 Client ID。

```js
window.SIMPLE_SCHEDULE_CONFIG = Object.freeze({
  microsoftClientId: '你的-client-id'
});
```

Client ID 是公开标识，不是密码。**不要创建或填写 Client Secret**；纯前端 SPA 不能安全保存 Client Secret。

## 数据位置

同步数据写入用户自己的 OneDrive App Folder：`OneDrive / Apps / [Entra 应用名称] / simpleschedule-sync.json`。

同步文件包含日程数据、每个任务的更新时间戳和删除 tombstone，用于跨设备合并。AI API Key 不会上传到 OneDrive。

## 同步语义

- localStorage 始终是当前设备的本地缓存，离线时仍可编辑。
- 连接 OneDrive 后，本地修改会防抖约 1.5 秒后自动同步。
- 页面重新获得焦点时会尝试拉取云端变化。
- 同一任务在不同设备被修改时使用每任务 last-write-wins 合并；删除操作通过 tombstone 传播，避免已删除任务被旧设备重新带回。
- 首次连接会合并本机和 OneDrive 两侧任务，而不是直接覆盖任意一侧。

## 权限设计

使用 `Files.ReadWrite.AppFolder` 的目的是保持最小权限：SimpleSchedule 只能读写它自己的 OneDrive 应用文件夹，而不能浏览用户 OneDrive 中的其他文件。

## 最终用户体验

正式站点中，普通用户只会看到 **使用 Microsoft 账号登录**、**立即同步**、**自动同步** 和 **退出 OneDrive**。Client ID 不出现在普通用户界面中；它只是 SimpleSchedule 这个 SPA 的公开应用标识，由站点维护者一次性配置。
