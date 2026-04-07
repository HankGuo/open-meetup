# Open Meetup（简体中文）

[English README](./README.md)

Open Meetup 是一个面向线下同场域活动的 LAN-first 单房间互动演示系统，适用于培训、工作坊、分享会和聚会场景。

它的核心目标是：在不增加部署复杂度的前提下，把传统静态播放流程升级为可实时互动的演示体验。

## 产品定位

- 同一时刻只维护一个活动房间
- 主持人统一控制流程与节奏
- 参与者可通过昵称首次加入，也可通过 Ticket 恢复身份
- 编排阶段与播放阶段明确分离
- 默认面向局域网快速落地
- 默认使用方式不依赖 Docker

## 核心能力

- `canvas` 页面：
  - 主持人可编辑自由画布（基于 Excalidraw）
  - 播放态为只读展示
- `showcase` 互动页：
  - 参与者提交 `url` 或 `image`
  - 可选是否启用排名（前三名显示金银铜皇冠）
  - 支持反复提交，以最后一次为准
- Ticket 身份机制：
  - 主持人与参与者都绑定 Ticket
  - Ticket 有效性统一由后端校验
  - 首次创建/加入会弹出“牢记 Ticket”提醒
- 编排模板能力：
  - 导出模板（`version: 1`）
  - 在编排阶段导入模板
- 图片链路优化：
  - 图片通过 HTTP 二进制上传
  - Socket 仅传 URL + 描述，不走 base64 大包

## 运行模型

- 房间状态：服务端内存态（`MemoryStore`）
- 上传资源：本地文件目录（`server/uploads`）
- 房间结束/关闭时：
  - 自动清理托管上传资源
  - 清理前端 `open-meetup:` 前缀的 localStorage 数据
- 服务端重启后：
  - 内存中的房间状态会重置

## 技术架构

- 前端：React + Vite + TypeScript
- 后端：Node.js + Express + Socket.IO + TypeScript
- 存储：
  - 房间运行态在内存
  - 上传文件落本地目录

## 环境要求

- Node.js 20+
- npm 10+
- 局域网部署场景下，主持人与参与者设备需在同一网络

## 快速开始

1. 安装依赖：

```bash
npm run install:all
```

2. 启动：

```bash
npm start
```

3. 将终端输出的局域网地址发给参与者访问。

启动后会输出类似：

`http://192.168.x.x:8080`

并会尝试自动复制该地址到剪贴板。

## 停止与日志

```bash
npm stop
npm run logs
```

## 启动参数

通过 `--` 传入：

```bash
npm start -- --host-password <口令> --port <前端端口>
```

- `--host-password`：主持人口令
- `--port`：前端访问端口（局域网分享端口）

示例：

```bash
npm start -- --host-password 12345678 --port 8080
```

## 配置项

### 常用配置

| 配置项          | 默认值     | 说明                                 |
| --------------- | ---------- | ------------------------------------ |
| `HOST_PASSWORD` | `12345678` | 主持人口令                           |
| `LAN_PORT`      | `8080`     | `npm start` 启动时前端局域网访问端口 |

### 后端运行配置

| 配置项                                 | 默认值         | 说明                            |
| -------------------------------------- | -------------- | ------------------------------- |
| `HOST`                                 | `0.0.0.0`      | 后端绑定地址                    |
| `PORT`                                 | `3001`         | 后端 HTTP/Socket.IO 端口        |
| `MAX_PARTICIPANTS_PER_ROOM`            | `50`           | 创建房间时的默认人数上限        |
| `DISCONNECT_GRACE_MS`                  | `300000`       | 断线后允许重连的最大保留窗口    |
| `SOCKET_PING_INTERVAL_MS`              | `10000`        | Socket.IO 心跳 ping 周期        |
| `SOCKET_PING_TIMEOUT_MS`               | `10000`        | Socket.IO 心跳超时时间          |
| `ROOM_CLEANUP_INTERVAL_MS`             | `1000`         | 断线超时清理任务轮询间隔        |
| `TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS` | `60`           | Ticket 校验接口单窗口最大请求数 |
| `CORS_ALLOW_ORIGIN`                    | 非生产默认 `*` | CORS 允许来源                   |
| `TRUST_PROXY`                          | `false`        | Express trust proxy 配置        |

说明：

- 创建房间时，主持人可在表单里自行设置房间人数上限。
- 人数上限硬边界为 `1 ~ 500`。

## 常用脚本

| 命令                    | 说明                             |
| ----------------------- | -------------------------------- |
| `npm start`             | 启动后端与前端（局域网友好模式） |
| `npm stop`              | 停止 `npm start` 启动的进程      |
| `npm run logs`          | 持续查看后端/前端日志            |
| `npm run build`         | 构建后端与前端                   |
| `npm test`              | 构建 + 后端测试 + 前端测试       |
| `npm run lint`          | ESLint 检查                      |
| `npm run format`        | Prettier 格式检查                |
| `npm run sim:bulk-join` | 批量入场模拟（独立测试工具）     |

## 接口与协议

详见：

- 接口文档：[docs/API.md](./docs/API.md)
- 开发指南：[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

核心 HTTP 接口：

- `GET /health`
- `GET /api/room/current`
- `GET /api/room/ticket-check?ticket=...`
- `POST /api/uploads/image`
- `GET /uploads/:roomId/:fileName`

## 安全说明

- Ticket 校验以后端为准。
- 上传路径参数在 HTTP 层与存储层均做了白名单校验。
- 存储层会执行路径边界检查，防止路径遍历。
- 空图片和非法图片类型会被拒绝。

## 测试与质量门禁

```bash
npm run lint
npm run format
npm test
```

当前覆盖：

- 后端测试（`node --test`）
- 前端单元测试（`vitest`）

## 目录结构

```text
open-meetup/
├── client/                         # React 前端
├── server/                         # Express + Socket.IO 后端
├── scripts/                        # 启停、日志、模拟工具脚本
├── docs/                           # 开发文档与接口文档
├── .env.example
├── README.md
└── README.zh-CN.md
```

## 当前设计边界

- 仅支持单活动房间
- 服务端重启后不会保留房间运行态
- 主要面向局域网和中小规模线下活动

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
