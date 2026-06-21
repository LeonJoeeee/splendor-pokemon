> ⚠️ **已废弃 / SUPERSEDED**:本文是项目早期的**自创草案**,其"贵族→道馆徽章""进化链折扣""extraBonus 招牌特性"等机制均为臆造,**不符合官方《璀璨宝石:宝可梦版》真实规则**。真实规则以 [`RULES.md`](RULES.md) 为准。本文仅作历史记录与 AI 设计参考(§7 AI 部分仍有价值)。

# 宝可梦：训练家联盟 (Pokémon Trainer League)
## 权威设计规范 v1.0 —— 基于 Splendor 经济的宝可梦主题对战游戏 + 启发式 AI

> 本规范是所有后续开发（引擎、数据、UI、AI）的唯一契约。`src/engine/types.ts` 是机器可读的硬契约；本文档是人类可读的设计权威。两者如有冲突，以 **本文档 + types.ts 共同描述的、且二者一致的部分** 为准；不一致处视为缺陷需修复。

---

## 架构决策（开源调研后）

- 经多角度开源调研：**没有可直接 fork 的、许可证明确的 Splendor/宝可梦 TS 引擎**。具体 Splendor 仓库要么许可证缺失（默认保留所有权利，不可复用），要么是 Python/许可证混杂（仅可作算法参考）。唯一已验证 MIT 且栈匹配的是 **boardgame.io**（回合框架，非游戏本身）。
- 真正可复用的开源资产是 **经过验证的 Splendor 规则与经济本身**（本设计 1:1 复用），以及 Python 仓库里的 **AI 算法思路**（评估特征、隐藏牌堆的 MCTS determinization）。
- **决策：自建纯函数引擎**（基于本 types.ts），React/Vite UI，Vitest 测试，AI 为框架无关的纯 TS。boardgame.io 与各 Splendor 仓库作 **参考**。
- 引擎保持 **纯函数 + 框架无关**，使得将来叠加 boardgame.io / 联网 / MCTS / RL 都无需重写规则、数据、AI。该决策因此可逆。

---

## 0. 设计哲学与评审结论

本设计以评审夺冠方案 **「Pokédex Training League（忠实 Splendor 复刻 + 进化折扣 + 属性徽章）」** 为骨架，嫁接了评审点名的最佳跨案创意：

- **骨架**：对验证过的 Splendor 经济做「最小、可证明有界」的扰动。进化折扣固定为 1、不叠加、确定性；招牌特性只保留 `extraBonus`（「该卡 bonus 计两次」）这一零运行时新规则的优雅设计。
- **AI-CLEAN 嫁接**：① 每次购买的全局折扣硬上限（防跨机制复利）；② `ownedSpecies: Set<string>` 实现 O(1) 进化前置检查；③ 所有机制确定性、完全可观察、无隐藏信息、无新增随机、无无界连锁，分支因子 ~30–50，支持 depth-1/2 前瞻；④ 「模拟执行特性后用同一评估函数重打分」的特性定价；⑤ 照搬 Splendor 成本/点数模板、只换颜色不重新调参。
- **进化引擎嫁接**：① 进化折扣值印在卡面（数据驱动、可审计）；② 属性克制作为 v2 可选模块，v1 默认关闭，仅预留挂钩。
- **保留**：构建期校验器、优雅降级（任一机制可零引擎改动关闭回退纯 Splendor）、进化链 5 色均匀分布、各色成本/bonus 配平审计。

**明确剔除**：Intimidate（跨回合持久状态）、「超能力克自身」自循环、`BONUS_PRESTIGE_IF`、`DRAW_ENERGY_2` 时序漏洞、`REFRESH_BOARD`/`FREE_RESERVE`、任何偏离 Splendor 模板的重新调参。

---

## 1. 主题映射

| Splendor 原件 | 本作 | 中文 |
|---|---|---|
| 5 种宝石 | 5 种能量类型 | 能量 |
| 金币 / 万能 | 彩虹能量（万能） | 彩虹能量 |
| 发展卡 | 你捕捉并训练的宝可梦 | 宝可梦卡 |
| 卡牌 bonus | 该宝可梦为队伍产出的能量类型 | 属性产出 |
| 卡牌声望点 | 训练名望 | 名望 |
| 贵族 | 道馆徽章 | 徽章 |
| 15 声望获胜 | 取得 15 名望进入冠军赛 | 名望 |

### 能量类型（= Splendor 5 色，1:1 映射）

| Splendor 色 | 能量 key | 中文 | 显示色 |
|---|---|---|---|
| green | `grass` | 草能量 | #4FA85B |
| red | `fire` | 火能量 | #E8463A |
| blue | `water` | 水能量 | #3D9BE9 |
| black | `electric` | 电能量 | #F2C94C |
| white | `psychic` | 超能力能量 | #A56FB5 |
| gold | `rainbow` | 彩虹能量（万能） | #C9C9CF |

固定能量顺序（所有确定性 tiebreak 使用）：`['grass','fire','water','electric','psychic']`。

---

## 2. 代币经济（与 Splendor 完全一致，仅换皮）

- **能量代币供给（按人数）**：2 人 = 每种 4；3 人 = 每种 5；4 人 = 每种 7。
- **彩虹能量**：任何人数恒为 5。
- **手牌上限**：10（含彩虹）；回合结束若超出，弃至 10（返还供给区）。

### 卡牌与牌库
- 共 **90 张宝可梦**：tier1 = 40，tier2 = 30，tier3 = 20。
- 每层展示 **4 张明牌**；牌库洗混，每次移除后从牌顶补充。
- **点数分布 1:1 保留**：tier1 大多 0（少量 1）；tier2 = 1–3；tier3 = 3–5。

### 徽章（贵族）
- 数量 = 玩家数 + 1，开局面朝上。
- 每个要求 2–3 种类型各若干 bonus（如 4+4 或 3+3+3），给 **3 名望**。
- 满足要求时自动获得，**每回合至多 1 个**。

### 每回合恰好执行一项动作
- **(A) 取 3 种不同能量** 各 1。
- **(B) 取同种能量 2 个** —— 仅当该堆「取前」≥ 4。
- **(C) 预定一张宝可梦**（明牌或盲抽牌顶），并取 1 彩虹（若有）；预定上限 3。
- **(D) 购买（捕捉）一张宝可梦**（场上或预定区），支付 [成本 − 对应 bonus]，彩虹替代任意一色；随后结算进化折扣与招牌特性。

---

## 3. 宝可梦机制（v1 仅 2 项，均确定性、有界、AI 可评估）

### 机制 1：进化链折扣（核心）

每张卡有 `family`、`stage`（1/2/3）。`stage>1` 的卡带 `evolvesFromFamily`（= 本卡 family），印有 `evolutionDiscount`（v1 一律为 1）。

**购买结算顺序（严格）**：
1. `afterBonus[c] = max(0, cost[c] − ownedBonus[c])`。
2. **进化折扣**：若被购卡 `stage>1` 且玩家**已购买**（桌面，非预定区）拥有至少一张同 `family` 且 `stage` 恰低一阶的卡，则获 1 折扣，从 `afterBonus` 中「当前剩余需求量最大」的单色扣除（并列按固定能量顺序取首）；每色不低于 0。折扣**不叠加**、**仅购买触发**、**不可追溯**。
3. **(v2) 属性克制折扣**：默认关。
4. **全局折扣硬上限**：进化 + 属性克制合计 ≤ `MAX_DISCOUNT_PER_PURCHASE`（=3）。v1 永不触顶，但引擎必须实现夹断。
5. **彩虹补缺**。

**平衡论证**：折扣恒为 1、不叠加、需先花一回合买下前置、不能使卡免费、不产生代币。等价于「某次购买时多一枚 bonus」，落在 Splendor 正常摆动范围内。

### 机制 2：招牌特性（v1 仅 `extraBonus`）

至多约 4–6 张 tier3 卡带 `ability = { type:'extraBonus', energy:X, amount:1 }`：该卡对「折扣计算」与「徽章阈值」都计为 **2 个 X bonus**（但「最少卡数」tiebreak 仍计 1 张）。`X` 必须 === 该卡 `bonus`。带特性卡基础成本相对模板 **+1** 以保经济中性。引擎派生 bonus 向量时该色计 2，其余逻辑全部复用、无需特判，可零引擎改动整体移除。

### 机制 3（v2 可选，默认关闭）：属性克制折扣 —— 仅预留挂钩

`GameConfig.enableTypeEffectiveness` 默认 false。封闭无自循环克制表 `SUPER_EFFECTIVE_AGAINST`：fire>grass, grass>water, water>fire, electric>water, psychic>fire。购买类型 T 卡时若 T 克制任一对手主导属性，获 1 折扣（受全局上限约束）。v1 数据须填 `weakness` 使 v2 开箱可用，但引擎默认不结算。

---

## 4. 胜利条件

率先达 **15 名望** 触发终局；补完当前一轮使所有玩家回合数相等；名望最高者胜。Tiebreak：**购买宝可梦最少**。仍平则共享胜利。

---

## 5. 确定性与可复现

所有随机（仅洗牌）经种子化 RNG（`rngSeed`）。无隐藏信息泄漏、无同时决策、无超出 Splendor 的随机源。整局可快照测试以回归平衡。

---

## 6. 优雅降级开关（`GameConfig`）

- `enableEvolutionDiscount`（默认 true）
- `enableSignatureAbility`（默认 true）
- `enableTypeEffectiveness`（默认 **false**，v2）

三者全关 = 纯 Splendor 换皮，保证可回退到验证过的经济。

---

## 7. 启发式 AI 设计（Phase 4）

评估函数 = 特征线性加权 `evaluate(state, me) = Σ wᵢ·featureᵢ`。建议初始权重（1 名望 ≈ 1.0）：

| 特征 | 说明 | 建议权重 |
|---|---|---|
| prestigeNow | 我方总名望（点数 + 3×徽章） | 1.0（终局 ×1.5–2.0） |
| prestigePerTurnVelocity | 每回合得分速度 | 0.6 |
| discountEngineValue | 各色永久 bonus 加权和，稀缺色更值 | 0.35 |
| affordabilityHorizon | 可买卡数 + 最佳目标「还需几回合」 | 0.3 |
| badgeProximity | 每徽章 Σmin(have,need)/Σneed；接近完成大正值 | 0.8 |
| evolutionSetupValue | 已拥前置的期权价值 | 0.25 |
| evolutionDiscountRealized | 买入若前置已拥则加实得折扣价值×稀缺度 | 0.3 |
| tokenEfficiency | 惩罚囤积逼近上限/持有无用色 | 0.3 |
| tokenScarcityPressure | 抢占将空的稀缺色（自用 + 拒止） | 0.2 |
| rainbowValue | 持彩虹的灵活性 | 0.25 |
| reserveTempo | 预定计划买的高分 tier3 | 0.2 |
| opponentDenial | 拒止领先对手 | 0.4×lead |
| endgameUrgency | 任一玩家 ≥11–12 时上调名望与徽章 | 触发式 |

**动作生成**：所有可负担买入 → 取2 → 取3 → 预定。对每动作模拟后继状态调 `evaluate` 取最高。**默认 1-ply 贪心**，终局（任一玩家距 15 ≤3）切 2-ply。

### 7.1 开源 AI 参考（调研所得，Phase 4/6 用）

可直接借鉴的启发式配方（来自 `gges5110/splender` 蓝图，无许可证→重写不复制）：
- 点数主导：`score += points * 10`。
- 永久折扣(bonus)价值早期更高、随已有卡数衰减：`max(3, 8 - ownedCards*0.3)`。
- 徽章/贵族进度：最高约 +5，按该卡推进未得徽章的程度缩放。
- 颜色均衡：对欠缺色小幅加分以分散折扣。
- **按阶段调 tier 偏好（最有效）**：早期重favor便宜 tier1、强力压制 tier2/3 使其早期"隐形"，后期翻转为高分卡。
- 动作阶梯：强制弃牌 → 强制徽章 → 买最高分可负担卡 → 持 9 代币时改预定(避免 10 上限弃牌) → 按需求取币(3异>2同>2异) → 预定兜底。

经验教训（Rinascimento 实证 + RL 研究）：
- **别过度设计**：浅层点数贪心/短前瞻已具竞争力；**对手建模反而有害**（→ 降低 `opponentDenial` 权重）；短horizon(深度~2)、UCB exploration=0 最优。
- 强 agent 先build折扣引擎（买很多便宜卡、早期避开贵 tier3），并瞄准徽章（强~1.4 个/局 vs 弱~1.07）。

升级路径参考（MIT，可移植/可客户端）：
- `roeey777/Splendor-AI`(MIT)：minimax+α-β、遗传算法调权、PPO+LSTM。
- `cestpasphoto/alpha-zero-general`(MIT)：Python 训练→导出 ONNX→`onnxruntime-web` 客户端推理，匹配"AI 跑浏览器"。
- `inhabae/Splendor-Zero`(参考)：IS-MCTS 处理隐藏牌堆/对手手牌，2068 Elo，隐藏信息的权威蓝图。
- MCTS 隐藏信息：每次模拟重新 determinize 未知牌堆/对手预定；或在抽牌机会节点 cap children(seal256 技巧)保持搜索深度。
- 主题参考：`euidong/poke-splendor`(宝可梦→Splendor reskin 证明)。

---

## 8. 开放问题（待 AI 自对弈模拟回归）

1. extraBonus 的 +1 成本是否真经济中性（双倍 bonus 同时加速徽章与折扣，可能偏强）→ 跑 win-turn 分布对比纯 Splendor。
2. 进化折扣是否把平均局长压到 Splendor 调校的 ~25–30 回合以下 → 种子化模拟测局长。
3. `MAX_DISCOUNT_PER_PURCHASE=3` 在 v1 永不触顶，是否对玩家暴露该开关。
4. 徽章池均衡（5 色覆盖）由数据 agent 按 COLOR_PARITY 审计定。
5. 传说单卡（如超梦）放 tier3 且不给进化折扣是否偏弱。
6. 3–4 人局 AI 的 opponentDenial 与收尾顺序建模最薄弱。
7. `weakness` 字段 v1 即填以保 v2 零数据迁移。
8. v2 属性克制的「抄领先者」激励是否有趣，待 v2 playtest。
