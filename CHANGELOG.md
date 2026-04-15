# Changelog

## [2.0.0] - 2026-04-15

### Features

- **ZIP 模板导出/导入**：编排模板从 JSON 格式升级为 ZIP 打包格式，导出时自动打包画布内容引用的所有本地图片资源到 `assets/` 目录，导入时自动解压并上传图片到服务端，确保模板跨会话完整复用
- **模板图片上传接口**：新增 `POST /api/uploads/template-asset` 接口，支持主持人在 setup 阶段上传模板关联图片
- **Electron 桌面应用封装**：支持 Win/Mac 双击安装使用，内置 Node.js 服务，无需任何开发环境
  - 首次启动配置窗口（端口、密码、房间名）
  - 系统托盘显示状态与局域网 IP
  - 自动启动内置 HTTP 服务，参与者扫码或输入地址即可加入
  - 支持 `electron-builder` 打包为 .dmg (macOS) 和 .exe (Windows)

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
