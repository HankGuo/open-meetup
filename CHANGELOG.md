# Changelog

## [1.0.1] - 2026-04-15

### Security

- **iframe sandbox 加固**：移除 `allow-same-origin`，防止参与者提交的 URL 页面逃逸沙箱访问主页面 DOM/Cookie（ShowcasePage.tsx）

### Refactor

- **提取 Excalidraw 公共工具模块**：`ContentViewer.tsx` 和 `PageEditor.tsx` 中重复的 4 个工具函数（`lockViewportAppState`、`constrainElementsToViewport`、`isSupportedEmbeddableUrl`、类型定义）提取到 `client/src/utils/excalidrawHelpers.ts`
- **错误信息统一中文**：`roomManager.ts` 中所有英文错误信息替换为中文，与前端提示语言保持一致
- **Magic number 常量化**：`generateParticipantTicket` 中的硬编码重试次数 `20` 提取为 `TICKET_GENERATION_MAX_ATTEMPTS` 常量

### Chore

- **移除未使用依赖**：从 `client/package.json` 中移除 `dompurify` 和 `marked`（声明但从未在代码中引用）
