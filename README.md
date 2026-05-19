# Open Meetup

Open Meetup 是一个面向线下活动（工作坊、培训、分享会）的 **LAN-first 单房间实时互动系统**。

它把“主持人讲 + 参与者看”的静态流程，升级为“主持人编排 + 参与者实时提交 + 全员同步展示”的互动流程，同时保持部署简单、可控、低运维成本。

## 目录

- [核心定位](#核心定位)
- [为什么做 Open Meetup？（Q&A）](#为什么做-open-meetupqa)
- [功能总览](#功能总览)
- [系统约束与边界](#系统约束与边界)
- [架构与运行模型](#架构与运行模型)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [常用命令](#常用命令)
- [接口与协议](#接口与协议)
- [压测脚本](#压测脚本)
- [发布前检查清单](#发布前检查清单)
- [故障排查](#故障排查)
- [项目结构](#项目结构)
- [安全说明](#安全说明)
- [许可证](#许可证)

## 核心定位

- 同一时刻只维护一个活动房间（single active room）
- 主持人统一控制流程与节奏
- 参与者通过昵称首次加入，后续可通过 Ticket 恢复身份
- 明确拆分 `setup`（编排）与 `live`（播放）两个阶段
- 局域网优先，适配线下同场景协作
- 默认启动流程不依赖 Docker

## 为什么做 Open Meetup？（Q&A）

**Q：现在大家都做云端 SaaS，为什么你要做 LAN-first（局域网优先）？**
**A**：因为“物理同频”的场景不需要“云端绕路”。

- **网络稳定性**：线下活动最容易崩溃的就是外网带宽。LAN-first 意味着只要现场路由器的局域网没挂，大家的协作和传图依然是毫秒级的。
- **数据隐私**：内部培训、敏捷回顾常涉及机密数据。数据完全在主持人的电脑上，**数据绝对不离场**。
- **消除注册阻力**：公网 SaaS 往往需要扫码或邮箱注册。我们希望参与者的体验是：输入局域网 IP -> 取个昵称 -> 马上开始互动。

**Q：为什么不用 MySQL/Redis，而是把房间状态全部放在内存里？**
**A**：为了追求极致的“部署成本”和“心智模型匹配”。

- **零部署门槛**：只要有 Node.js，一行 `npm start` 就能在 3 秒内把服务跑起来。不需要配置数据库，小白也能当主持人。
- **符合线下活动的心智**：线下的会议室，开完会白板就要被擦掉。服务一旦关闭，状态自然销毁。如果需要保留产出，可以使用“ZIP 导出”带走成果。

**Q：为什么只支持“单房间（Single Active Room）”，不支持多房间并发？**
**A**：这是产品的刻意克制（Opinionated Design）。
Open Meetup 的假想用户是**“一位正在主持活动的引导者”**，而不是提供公共服务的平台方。单房间设计让代码架构极其简单、优雅，同时完全满足了一个主持人在自己电脑上开一场活动的真实诉求。

**Q：既然数据在内存里，那怎么解决复用和备份的问题？**
**A**：我们用类似 PPT 的“文件模型”代替了“数据库模型”。
我们开发了**自包含的 ZIP 模板引擎**。你可以提前在家里编排好你的活动流程，导出为 `.zip`。到了活动现场，无论换了哪台电脑，只要导入这个 ZIP，所有的流程、画布和素材都会瞬间恢复。**就像是用 U 盘拷贝了一份互动的 PPT。**

**Q：如果我想把这个工具部署到公网上让异地的人用，可以吗？**
**A**：完全可以。
虽然它是 LAN-first，但本质上是一个标准的 Node.js + Web 应用。你可以把它挂在公网配合 Nginx 使用。但需要注意，由于它没有鉴权隔离且是单房间模型，它只适合作为个人或小团队的“私有互动服务器”，而不适合作为公开的 SaaS 平台。

## 功能总览

### 1) 页面类型

- `canvas`（自由画布）
  - 主持人使用 Excalidraw 编辑
  - 播放态只读展示
- `showcase`（互动页）
  - 参与者提交 `url` 或 `image`
  - 支持可选“排名皇冠”展示（前 3 名）
  - 同一参与者同一页面可反复提交，后一次覆盖前一次

### 2) 身份与会话

- 主持人与参与者均绑定 Ticket
- Ticket 有效性统一由后端判定
- 断线重连基于 `(userId, sessionId)` 与 socket 侧身份映射校验
- 首次加入/建房后前端会提示用户保存 Ticket

### 3) 编排模板（ZIP 格式）

- 支持导出 ZIP 模板（包含页面定义 + 画布内容 + 引用的图片资源）
- 支持在 `setup` 阶段导入 ZIP 模板，自动还原图片资源到当前房间
- 模板文件可跨会话、跨机器复用

### 4) 图片上传链路

- 图片通过 HTTP 二进制上传（`POST /api/uploads/image`）
- Socket 侧仅传作品 URL + 描述，避免 base64 大包推送

## 系统约束与边界

- 仅支持单房间运行，不支持并发多房间
- 房间状态存储在内存（服务重启后房间状态丢失）
- 上传文件落地在本地文件系统（`server/uploads`）
- 适用于中小规模线下活动（不是公网大规模 SaaS 场景）

## 架构与运行模型

### 技术栈

- 前端：React + Vite + TypeScript
- 后端：Node.js + Express + Socket.IO + TypeScript
- 测试：Node Test Runner + Vitest

### 状态模型

- 房间状态：`MemoryStore`
- 核心编排：`RoomManager`
- 输入校验：`roomManager.validation.ts`
- 状态快照：`roomManager.state.ts`
- 上传清理：`roomManager.uploads.ts`

### 生命周期

1. 主持人创建房间（`setup`）
2. 主持人编排页面（增删改、排序、模板导入导出）
3. 主持人开始播放（进入 `live`）
4. 参与者按当前互动页提交内容
5. 主持人翻页/回编排/结束房间

## 快速开始

### 环境要求

- Node.js 20+
- npm 10+

### 安装依赖

```bash
npm run install:all
```

### 启动

```bash
npm start
```

启动后会输出局域网访问地址（例如 `http://192.168.x.x:8080`），并尝试自动复制到剪贴板。

### 停止与日志

```bash
npm stop
npm run logs
```

### 可选启动参数

```bash
npm start -- --host-password <口令> --port <前端端口>
```

示例：

```bash
npm start -- --host-password 12345678 --port 8080
```

## 环境变量

### 常用

| 变量名          | 默认值     | 说明                   |
| --------------- | ---------- | ---------------------- |
| `HOST_PASSWORD` | `12345678` | 主持人口令             |
| `LAN_PORT`      | `8080`     | CLI 启动时前端访问端口 |

### 后端运行时

| 变量名                                 | 默认值         | 说明                               |
| -------------------------------------- | -------------- | ---------------------------------- |
| `HOST`                                 | `0.0.0.0`      | 后端绑定地址                       |
| `PORT`                                 | `3001`         | 后端端口                           |
| `MAX_PARTICIPANTS_PER_ROOM`            | `50`           | 新建房间默认人数上限（不含主持人） |
| `DISCONNECT_GRACE_MS`                  | `300000`       | 断线保留窗口（ms）                 |
| `ROOM_CLEANUP_INTERVAL_MS`             | `30000`        | 断线清理轮询间隔（ms）             |
| `SOCKET_PING_INTERVAL_MS`              | `10000`        | Socket.IO ping 周期（ms）          |
| `SOCKET_PING_TIMEOUT_MS`               | `10000`        | Socket.IO ping 超时（ms）          |
| `TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS` | `60`           | Ticket 校验接口限流阈值（每窗口）  |
| `IMAGE_UPLOAD_RATE_LIMIT_MAX_REQUESTS` | `30`           | 图片上传接口限流阈值（每窗口）     |
| `CORS_ALLOW_ORIGIN`                    | 非生产默认 `*` | 允许的 CORS 来源                   |
| `TRUST_PROXY`                          | `false`        | Express trust proxy 设置           |

说明：

- 人数上限硬边界是 `1 ~ 500`
- 生产环境必须显式配置安全项（尤其 `HOST_PASSWORD`、`CORS_ALLOW_ORIGIN`）

## 常用命令

| 命令                    | 说明                                 |
| ----------------------- | ------------------------------------ |
| `npm start`             | 启动后端和前端（局域网友好模式）     |
| `npm stop`              | 停止 `npm start` 启动的进程          |
| `npm run logs`          | 持续查看 server/client 日志          |
| `npm run build`         | 构建 server/client                   |
| `npm test`              | 执行构建 + server 测试 + client 测试 |
| `npm run lint`          | ESLint 检查                          |
| `npm run format`        | Prettier 格式检查                    |
| `npm run sim:bulk-join` | 批量加入模拟（压测辅助）             |

## 接口与协议

详细文档：

- [docs/API.md](./docs/API.md)
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

核心 HTTP 接口：

- `GET /health`
- `GET /api/room/current`
- `GET /api/room/ticket-check?ticket=...`
- `POST /api/uploads/image`
- `GET /uploads/:roomId/:fileName`

核心 Socket 事件：

- 房间生命周期：`room:create` / `room:join` / `room:reconnect` / `room:leave` / `room:end`
- 主持控制：`control:start-live` / `control:return-setup` / `control:next` / `control:prev`
- 编排相关：`pages:update` / `page:update` / `layout:import`
- 互动提交：`work:submit` / `upload:revert`
- 服务端推送：`state:sync` / `room:closed`

## 压测脚本

工程内置批量加入模拟器：

```bash
npm run sim:bulk-join -- --count 40 --server http://localhost:3001
```

常见参数：

- `--count <n>`：模拟人数
- `--spread-ms <ms>`：错峰启动间隔
- `--timeout-ms <ms>`：单连接超时
- `--auto-create-room`：无房间时自动建房
- `--end-room-on-exit`：结束时自动关闭模拟房间

## 发布前检查清单

建议每次发版执行：

```bash
npm run lint
npm run format
npm test
```

并额外做一次人工验收：

1. 主持人建房 -> 编排 -> 开始播放 -> 翻页 -> 回编排 -> 结束
2. 参与者首次加入、Ticket 重入、断网重连
3. `showcase` 的 URL 提交与图片提交都可正常展示
4. 结束房间后参与端收到 `room:closed` 并回到入口页
5. 多端同时在线时成员列表与当前页同步正常

## 故障排查

### 启动失败

- 先看 `npm run logs`
- 检查端口占用：前端端口（默认 8080）和后端端口（默认 3001）
- 检查 `HOST_PASSWORD` 是否为空（生产环境会阻止启动）

### 参与者无法加入

- 确认主持端与参与端在同一局域网
- 确认访问地址为主持机 LAN IP（非 `localhost`）
- 用 `GET /api/room/current` 检查是否存在活动房间

### Ticket 不可用

- 用 `GET /api/room/ticket-check?ticket=...` 验证
- 房间关闭、服务重启或超时清理后，旧 Ticket 会失效

### 图片无法上传

- 检查请求头 `X-Open-Meetup-Ticket`
- 检查请求头 `X-Open-Meetup-Page-Id`
- 检查 `content-type` 是否为 `image/*`
- 检查图片大小（前后端限制均为 4MB）

## 项目结构

```text
open-meetup/
├── client/                         # React 前端
├── server/                         # Express + Socket.IO 后端
├── scripts/                        # 启停/日志/模拟脚本
├── docs/                           # API 与开发文档
├── .env.example
├── README.md
└── README.zh-CN.md
```

## 安全说明

- Ticket 与 session 均由后端判定，前端不信任本地身份状态
- 上传路径在 HTTP 与存储层双重白名单校验
- 存储层做路径边界检查，防止路径遍历
- 非法图片类型与空 payload 会被拒绝

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
