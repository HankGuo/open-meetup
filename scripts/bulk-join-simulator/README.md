# 批量加入模拟器（独立测试）

这个目录是**完全独立**的测试工具，不会改动主业务逻辑。

## 作用

模拟 30+ 用户并发加入当前房间，用于观察主持人端/参与者端在高并发入场下的表现。

## 一键使用

```bash
npm run sim:bulk-join
```

默认行为：
- 目标人数：35
- 连接地址：`http://localhost:3001`
- 只加入“当前已存在房间”
- 成功后保持在线 120 秒，便于观察页面效果
- 到时自动让模拟用户离开

## 常用命令

1) 模拟 40 人加入当前房间

```bash
npm run sim:bulk-join -- --count 40
```

2) 如果当前没有房间，自动创建后再压测

```bash
npm run sim:bulk-join -- --count 35 --auto-create-room --host-password 12345678
```

3) 保持在线 5 分钟

```bash
npm run sim:bulk-join -- --count 35 --keep-alive-ms 300000
```

4) 结束时连自动创建的房间一起关闭

```bash
npm run sim:bulk-join -- --auto-create-room --end-room-on-exit
```

## 参数说明

- `--count <n>`: 模拟人数
- `--server <url>`: 服务端地址
- `--spread-ms <ms>`: 每个模拟用户启动间隔
- `--timeout-ms <ms>`: 单用户加入超时
- `--keep-alive-ms <ms>`: 成功后保持在线时长
- `--auto-create-room`: 无房间时自动创建
- `--host-name <name>`: 自动创建房间时主持人昵称
- `--room-title <title>`: 自动创建房间时标题
- `--host-password <pwd>`: 自动创建房间时口令
- `--user-prefix <prefix>`: 模拟用户名的前缀
- `--end-room-on-exit`: 退出时结束自动创建的房间

## 备注

- 服务端单房间人数上限是 50（包含主持人），超出会出现 `ROOM_FULL`。
- 这是压测/演示工具，不建议在生产环境直接使用。
