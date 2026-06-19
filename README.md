# Happy Dou Dizhu Arena

一个基于 React + TypeScript + Node.js WebSocket 的欢乐斗地主联机 Web 游戏。项目包含前端牌桌、WebSocket 后端、共享规则引擎，可以本地三人联机，也可以由电脑自动补位试玩。

## 功能特性

- 三人斗地主房间，支持房间号加入
- 电脑玩家自动补位
- 叫地主 / 抢地主流程
- 地主底牌展示与加入手牌
- 完整主要牌型判断与压制逻辑
- 出牌、过牌、轮转、最近出牌显示
- 炸弹、王炸翻倍
- 胜负结算与积分累计
- 托管模式与离线自动托管
- 机器人自动叫牌与自动出牌
- 响应式牌桌界面

## 技术栈

- React 19
- TypeScript
- Vite
- Node.js
- ws WebSocket
- lucide-react

## 快速开始

```bash
npm install
npm run dev
```

启动后访问：

```text
http://127.0.0.1:5173
```

后端 WebSocket 默认运行在：

```text
ws://127.0.0.1:8787/ws
```

## 房间联机

默认房间号是 `lobby`。也可以通过 URL 指定房间：

```text
http://127.0.0.1:5173?room=test-room
```

多个浏览器窗口或多台设备访问同一个房间号即可进入同一桌。当前开发配置默认监听 `127.0.0.1`，如果需要局域网访问，可以调整 Vite 和后端监听地址。

## 常用命令

```bash
npm run dev
```

同时启动前端和 WebSocket 后端。

```bash
npm run check
```

运行 TypeScript 类型检查。

```bash
npm run build
```

构建生产版本。

```bash
npm start
```

运行构建后的后端服务。

## 项目结构

```text
.
├── server/          # Node.js WebSocket 后端
├── shared/          # 前后端共享类型与斗地主规则
├── src/             # React 前端
├── index.html
├── package.json
└── vite.config.ts
```

## 玩法流程

1. 进入页面后输入昵称和房间号。
2. 点击“开始一局”。
3. 系统发牌，进入叫地主 / 抢地主阶段。
4. 地主获得三张底牌并先手出牌。
5. 玩家按规则出牌或过牌。
6. 任意一方先出完手牌后结算积分。

## 牌型支持

- 单牌
- 对子
- 三张
- 三带一
- 三带二
- 顺子
- 连对
- 飞机
- 飞机带单
- 飞机带对
- 四带二
- 四带两对
- 炸弹
- 王炸

## 说明

这是一个完整可运行的 Web 游戏原型，重点覆盖斗地主核心流程和主要规则。机器人策略偏基础，适合本地试玩、联机验证和继续扩展。
