# 宝可梦：训练家联盟 (Pokémon Trainer League)

官方授权桌游 **《璀璨宝石:宝可梦版》(Splendor: Pokémon)** 的**非官方同人数字实现** + 启发式 AI,纯前端(Vite + React + TypeScript),打开即玩,AI 跑在浏览器里。

> 📐 **权威规则见 [`docs/RULES.md`](docs/RULES.md)**(经多源核验的真实规则)。
> 联机设计见 [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md)。

## ⚠️ 免责声明
本项目是**非官方、非商用同人作品**,与任天堂 / 宝可梦公司 / Space Cowboys / Asmodee **无任何隶属或授权关系**。"宝可梦 / Pokémon""璀璨宝石 / Splendor" 为各自权利人的商标。仓库**不打包任何官方卡图、规则书或成套官方数据**;宝可梦插画在运行时从社区资源 [PokéAPI](https://pokeapi.co) 拉取,版权归原权利人。MIT 许可仅覆盖本仓库的原创代码,见 [`LICENSE`](LICENSE)。

## 玩法概览(真实规则)
- 代币 = **宝可梦球**:5 色(红/蓝/黑/粉/黄)各 7 + **大师球**(紫,百搭)5。
- 捕捉宝可梦积累**永久加成球**(抵扣后续成本)与分数;**率先 18 分**触发终局。
- **无贵族 / 无徽章**。取而代之:
  - **进化**:回合末免费动作,凭已有永久加成图标(不花代币)把低阶宝可梦升级为高阶。
  - **稀有 / 传说** 两条特殊卡线:像普通卡一样购买,但成本必含大师球、不可预订/进化,给 2 个加成(稀有 0 分 / 传说 2 分)。

> 早期自创草案 [`docs/DESIGN.md`](docs/DESIGN.md) 已被 RULES.md 取代(那版机制为臆造,不符合真实规则)。当前代码正从草案迁移到真实规则。

## 运行
```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm test           # 引擎单测 + 自对弈守恒/终止性
npm run sim 500    # 跑 500 局随机/贪心自对弈，打印统计
```

## 目录结构
```
src/
  engine/      纯函数规则引擎（框架无关，可测试）
    types.ts     类型契约（唯一硬契约）
    setup.ts     开局（种子化洗牌）
    buy.ts       购买结算（bonus→进化折扣→上限→彩虹）
    moves.ts     legalMoves 合法动作枚举
    apply.ts     applyAction reducer（5 动作+徽章+终局+僵局网）
    derive.ts    派生缓存（bonus/已拥物种/名望）
    validate.ts  数据集构建期校验
  data/        卡牌 / 徽章数据（当前为占位集，Phase 3 替换为完整 90 卡）
  ai/policies.ts  对局策略（random / greedy），UI bot 与自对弈共用
  sim/selfplay.ts 自对弈 harness（守恒 + 终止性回归）
  ui/          React 组件（CardView / PlayerPanel / TokenBank / theme）
  App.tsx      游戏装配 + 人机交互 + AI 驱动
```

## 架构决策
开源调研结论：无可直接 fork 的、许可证明确的 Splendor/宝可梦 TS 引擎；最佳开源资产是 **Splendor 经过验证的规则经济本身**（已 1:1 复用）。引擎自建为**纯函数、框架无关**，故将来可无痛叠加 boardgame.io / 联网 / MCTS / RL（详见 DESIGN.md §7.1 的 AI 参考）。

## 开发阶段
- [x] Phase 0 脚手架 + 类型契约
- [x] Phase 1 引擎核心(纯函数,单测 + 自对弈守恒/终止)
- [x] Phase 2 最小可玩 UI(人vs人 / 人vs电脑,端到端验证引擎)
- [x] 规则调研:确认《宝可梦版》真实规则(见 [`docs/RULES.md`](docs/RULES.md))
- [ ] **Phase 3 按真实规则重做**:移除贵族/徽章 → 加入**进化(回合末免费动作)** + **稀有/传说卡线**;5 色宝可梦球 + 大师球;胜利 18 分;真实卡牌数值;**官方插画卡面**(PokéAPI)
- [ ] Phase 4 启发式 AI(线性加权评估 + 1-ply,终局 2-ply)
- [ ] Phase 5 联机(单桌 · 输名字加入 · AI 补位,见 [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md))
- [ ] Phase 6 平衡模拟 + 打磨 + MCTS/RL 升级

> 注:当前代码实现的是早期自创规则(贵族/徽章/进化折扣),正在迁移到上面的真实规则。
