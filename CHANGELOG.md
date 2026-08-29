# Changelog

## [2.1.0] - 2026-08-30

### Security

- **口令爆破防护**：`room:create` 口令连续输错按 IP 锁定（默认 10 次 / 5 分钟窗口）；口令比较改为常数时间（`timingSafeEqual`）；生产环境强制 `HOST_PASSWORD`，长度下限可配
- **上传内容安全**：图片上传按魔数核实真实类型，不再信任 Content-Type 头；SVG 默认拒绝上传（`ALLOW_SVG_UPLOAD=1` 可显式开启）；`/uploads` 响应统一加 `Content-Security-Policy: sandbox` + `nosniff`，SVG 强制下载，杜绝存储型 XSS
- **Socket 层限流**：新增连接级事件限流（默认 180 事件/10 秒/连接），超限丢弃并推送 `rate:limited`
- **身份抢占防护**：同一 Ticket 在其他在线连接上使用时拒绝加入（`SESSION_ACTIVE`），修复"第二个标签页静默顶掉第一个页面会话"导致的幽灵页面问题
- **HTTP 加固**：全局 `nosniff` / `X-Frame-Options` / `Referrer-Policy`；Ticket 校验改为 POST 避免凭证进入访问日志；限流 Key 移除可伪造的 User-Agent 维度；生产依赖漏洞清零（含 ws 高危 CVE）

### Performance

- **页面内容增量同步**：`state:sync` 不再携带 `pageContents`，翻页/编辑只广播 `content:update`（单页增量），结构变更才广播 `content:reset`；50 人房间翻页带宽从"全量画布×人数"降为 KB 级
- **内容尺寸上限**：画布单页 8MB / 文本类 64KB（可配），Socket 单包上限 10MB（可配），防止内存 DoS
- **房间资产配额**：单房间上传总配额默认 256MB（可配），超配拒绝上传

### Features

- **主持人移出参与者**：新增 `room:kick` 事件与成员名单"移出"按钮，被移出者收到 `room:kicked` 提示后退出，其提交与上传一并清理
- **昵称去重**：重名（忽略大小写）加入被拒绝，避免展示混淆
- **优雅停机**：`SIGINT/SIGTERM` 先广播 `room:closed (SERVER_SHUTDOWN)` 再退出；CLI stop 由 SIGKILL 改为 SIGTERM 优雅退出
- **失败加入不再破坏现有会话**：`room:join` 校验失败不再剥离当前 socket 的身份绑定

### Template UX Redesign（模板功能重设计）

- **模板库**：导出的模板自动存入浏览器 IndexedDB（最多 12 份 / 160MB LRU），编排台新增"模板库"面板，支持应用 / 下载 / 删除，无需反复翻找文件
- **导入预览**：导入前展示模板名称、页数构成、素材数与导出时间，所见即所导
- **合并模式**：新增"合并到当前编排"（默认推荐），模板页面重新映射 ID 后追加到现有页面之后；原"覆盖导入"保留为"替换当前编排"并给出红色警示
- **上传进度**：模板素材并行上传（并发 4）+ 进度条 + 失败明确报错（含限流场景的等待提示）
- **导出命名**：导出时可为模板命名（默认"房间标题 · 时间"），元数据写入 template.json 并随模板库展示

### Deployment

- **CLI 生产模式**：`npm start` 默认自动构建并以单进程单端口托管（`NODE_ENV=production` + `CLIENT_DIST_PATH`），不再把 Vite dev server / ts-node-dev 暴露给现场参与者；`--dev` 保留开发者模式；未提供口令时自动生成强口令
- **服务端启动信息**：直接打印局域网访问地址；单端口自托管模式下 CORS 默认放行同源（公网反代部署仍强制显式配置）
- **开发代理**：Vite dev 代理 `/api` `/uploads` `/socket.io`，开发环境与生产同源行为一致

### Fixed

- 参与者输错昵称/重名时不再被踢下线（`joinRoom` 校验顺序修复）
- GIF 等短头图片魔数识别修正

## [2.0.0] - 2026-04-15

### Features

- **ZIP 模板导出/导入**：编排模板从 JSON 格式升级为 ZIP 打包格式，导出时自动打包画布内容引用的所有本地图片资源到 `assets/` 目录，导入时自动解压并上传图片到服务端，确保模板跨会话完整复用
- **模板图片上传接口**：新增 `POST /api/uploads/template-asset` 接口，支持主持人在 setup 阶段上传模板关联图片

### Breaking Changes

- 模板格式从 `.json` 改为 `.zip`，不兼容旧版 JSON 模板文件

## [1.0.1] - 2026-04-15

### Security

- **iframe sandbox 加固**：移除 `allow-same-origin`，防止参与者提交的 URL 页面逃逸沙箱访问主页面 DOM/Cookie（ShowcasePage.tsx）

### Refactor

- **提取 Excalidraw 公共工具模块**：`ContentViewer.tsx` 和 `PageEditor.tsx` 中重复的 4 个工具函数提取到 `client/src/utils/excalidrawHelpers.ts`
- **错误信息统一中文**：`roomManager.ts` 中所有英文错误信息替换为中文
- **Magic number 常量化**：`generateParticipantTicket` 中的硬编码重试次数提取为 `TICKET_GENERATION_MAX_ATTEMPTS` 常量

### Chore

- **移除未使用依赖**：从 `client/package.json` 中移除 `dompurify` 和 `marked`
