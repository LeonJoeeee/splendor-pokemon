# 联机对战设计（单桌 · 输名字加入）

> 后续功能。**排在规则改对（《宝可梦版》）+ 核心游戏做扎实之后**再实装。本文是确定的设计契约。

## 需求（用户确定）
- 几个朋友**同一桌**一起玩(无需多房间/房间码)。
- 每人**输入自己的名字**加入并占一个座位。
- **默认 4 人局**。
- **人不够时用 AI 补空位**(开局前把空座设为电脑)。
- 服务器:**你本地起 + 临时隧道**(cloudflared / ngrok)生成公网网址,发群里;想玩时手动起,零部署零成本。

## 架构:极小「裁判」WebSocket 服务器,复用纯引擎
```
朋友A/B/C/D 浏览器 ── WebSocket ──> Node 服务器(权威, 跑现有 engine) ──广播牌局──> 全体
                                         本地启动 + cloudflared 隧道
```
- 服务器**直接 import 现有纯引擎**(`createGame` / `legalMoves` / `applyAction`),作单一事实来源。零规则重写——这是当初引擎做成纯函数、框架无关的回报。
- turn-based、单桌、整份状态广播即可,工程量小。

## 大厅与流程
1. 打开网址 → 「训练家联盟 · 等待入座(4 座)」。
2. **输入名字** → 占下一个空座;断线后输同名字回原座。
3. 房主把剩余空座设为 **AI**(可选难度);满 4 座(含 AI)后点「开始」。
4. 轮到谁只有谁能操作(服务器按座位校验);AI 座轮到时服务器自动用策略走子。

## 消息协议(client ⇄ server)
- `JOIN {name}` → 分配座位 / 重连回座。
- `SEAT_UPDATE {seats:[{idx,name,kind:human|ai|empty}]}`(广播)。
- `SET_AI {idx, level}` / `REMOVE_SEAT {idx}`(仅房主,大厅阶段)。
- `START`(房主)→ 服务器 `createGame({players, seed})`。
- `ACTION {action}` → 服务器校验(发送者===当前座位 && action ∈ legalMoves)→ `applyAction` → 广播新状态。
- `STATE {view}`(广播,见下「状态视图」)。
- `ERROR {msg}` / `PLAYER_LEFT {idx}` / `GAME_OVER {winnerId}`。

## 状态序列化 / 隐藏信息
- `GameState` 基本可 JSON,**例外**:每个玩家的 `ownedSpecies: Set<string>` 不可序列化 → 提供 `serializeState` / `deserializeState`:**丢弃 Set,反序列化时由 `purchased` 用 `computeOwnedSpecies` 重建**(已有该函数)。
- **隐藏牌堆**:发给客户端的 `view` 把各层 `drawPile` 抹成只剩**数量**(`drawPile: count`),牌序只存服务器。防止客户端偷看后续牌(朋友间无所谓,但顺手做对)。
- 同步用「整份状态广播」(turn-based 足够稳),不用 lockstep/动作回放,避免确定性/分叉问题。

## 断线重连
- 座位绑定名字;客户端掉线/刷新后 `JOIN {同名}` → 服务器把该座标记 human 并补发当前 `STATE`。
- 期间轮到掉线者:可设「N 秒后该回合由 AI 代打」或「暂停等待」(默认 AI 代打,保证不卡)。

## 落地阶段(在核心游戏完成后)
1. `serializeState/deserializeState` + 牌堆抹序的 `toView(state, seatIdx)`。
2. Node `ws` 服务器:单房间、座位表、JOIN/START/ACTION 处理、AI 座自动走子、`npm run server`。
3. 大厅 UI:输名字 / 座位列表 / 设 AI / 开始。
4. 客户端传输层:把现在 `App` 里的本地 `setGame(applyAction(...))` 替换为「发 ACTION → 收 STATE」;本地单机模式保留(离线 vs AI)。
5. 重连 + 掉线代打。
6. 隧道说明文档:`cloudflared tunnel --url http://localhost:8787`(或 ngrok),把网址发群里。

## 与本地模式的关系
- 现有**本地单机**(人 vs 电脑 / 同设备热座)保留。联机是叠加的传输层,引擎/UI 组件复用。
- **默认 4 人**:待完整 90 卡数据(Phase 3)落地后,本地与联机默认人数都设为 4(占位数据集名望不足以支撑 4 人,会僵局,故现阶段本地演示暂留 2 人)。
