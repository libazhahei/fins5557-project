# 产品需求文档（PRD）· Quant Lab

| 项 | 内容 |
| --- | --- |
| 状态 | 活文档（轻量对齐 prd-development 骨架；随 Step 交付更新） |
| 受众 | 个人研究者、量化入门者 |
| UI 语言 | 默认英文，可切换中文；标的代码保留市场惯例（如 `SPY`） |
| 导航定稿 | [design/ia/navigation.md](../design/ia/navigation.md) |
| LLM | 主模型 `gemini-3.8-flash`；lite `gemini-3.1-flash-lite`（测试 + context compact）— [MODELS.md](./MODELS.md) |
| 界面截图 | [docs/screenshots/step2/](./screenshots/step2/) |
| 实现进度 | [Step1](./reports/04-step1-workspace-progress.md) · [Step2](./reports/05-step2-progress.md) |

---

## 1. Executive Summary

我们在为个人研究者与量化入门者构建 **Quant Lab**：一体研究工作台，解决「工具散落、假设难复现、回测结果难读懂」的问题。用户可在同一 `/workspace` 里先做单标的看盘摸底（Watchlist、K 线、指标、画线），再用模板/对话跑回测，看 KPI、净值 vs 基准、Trade Log 与 AI 解读，并用蒙特卡洛做路径压力、用 Diff 对比多次假设。目标是 **15 分钟内完成首次可解释回测**，并在同会话内完成至少一次改参对比——吸收交易终端里真正好用的可视化与指标能力，但 **不做实盘下单**。

---

## 2. Problem Statement

### Who has this problem?

- **个人研究者**：用 Excel / Notebook / 券商 App 拼假设验证，复现与对比成本高。
- **量化入门者**：想搞懂「想法 → 规则 → 回测 → 指标」，但术语多、怕写代码、看不懂回撤/夏普/过拟合。

### What is the problem?

研究前缺少单标的摸底环境；研究中回测与图表割裂；研究后缺少「图上复盘 + 人话风险」与可追溯的多次对比。纯对话黑箱或纯 Notebook 都无法同时降低门槛与保留可解释性。

### Why is it painful?

- 换工具即丢上下文；改一个参数就要重搭一遍。
- 入门者只能看到数字，无法把买卖点、regime、预测与叙事对齐到同一张图。
- 🔶 **Assumption**：课设/自用场景下，用户更需要「讲清楚一次实验」而非机构级协作权限。

### Evidence

- 产品演进：Step 1 交付「模板 → 回测 → 基准图 → 解读」后，规格仍明确两个断点——摸底缺失、图上 Log/预测复盘缺失（见 [Step2 规格](./step2-market-workspace-spec.md)）。
- 🔵 **Open Question**：尚无系统化用户访谈量化；当前以演示路径与 DoD 验收为主。

---

## 3. Target Users & Personas

### 3.1 人格

| 人格 | 诉求 | 痛点 |
| --- | --- | --- |
| **个人研究者** | 快速验证假设、留存实验轨迹、对比多次 run；跑前摸底单标的 | 工具链散落，复现成本高 |
| **量化入门者** | 搞懂「想法 → 规则 → 回测 → 指标」；需要人话与诚实风险提示 | 术语多、怕写代码 |

### 3.2 Jobs-to-be-done

1. **摸底**：Watchlist + K 线/指标/画线 + 标的画像（PE、HV、ATR…）。
2. **探索**：把模糊想法变成可测假设（标的、规则、再平衡、约束）。
3. **验证**：历史回测；可选 **蒙特卡洛** 多路径压力；可选 RV/ML 进阶。
4. **解读**：通俗语言解释好坏与过拟合风险；图上对齐 Trade Log / 预测层。
5. **迭代**：改一处假设再跑，Diff 对比参数与 KPI。

### 3.3 非目标用户（v1）

- 实盘下单 / 券商接单用户
- 高频 / 日内 tick 交易者
- 需要多团队协作与复杂权限的机构台

---

## 4. Strategic Context

| 项 | 内容 |
| --- | --- |
| **定位** | 研究台，不是交易终端；吸收终端好用能力（指标、可视化、画线、Watchlist）服务假设验证 |
| **Why now** | Step 1 单次闭环已通；若不补摸底与图上复盘，用户仍在「跑得动但讲不清 / 跑前摸不着」 |
| **市场/OKR** | 课设与个人研究产品；不做 TAM 估算（🔶 Assumption：成功以旅程可完成度为准） |
| **竞争参照** | 券商终端（强行情弱研究叙事）、Notebook（强灵活弱入门）、纯 Chat 量化（弱图表契约） |

---

## 5. Solution Overview

**一体工作台 `/workspace`**：最左 Activity Bar 切换 **Market / Lab / Diff**，中栏共享 `ChartWorkspace`（K 线、指标、画线、可选 Logs/Pred），右栏随焦点切换画像 / 回测解读 / Diff。

```text
Activity Bar │ Left panel        │ Center chart              │ Right inspector
Market       │ Watchlist         │ K / indicators / drawings │ Ticker info
Lab          │ Templates+params  │ Same chart + run overlays │ AI / Trade log
Diff         │ Run multi-select  │ Equity compare            │ Param / KPI diff
```

截图：[Market](./screenshots/step2/market.png) · [Lab](./screenshots/step2/lab-backtest.png) · [Diff](./screenshots/step2/diff.png) · [图册说明](./screenshots/step2/README.md)

### 5.1 信息架构（站点）

```text
Landing /
├── Login /login
└── App shell
    ├── Workspace /workspace?runId&compareIds   ← 默认研究画布
    ├── Runs /runs
    ├── Signals /signals                       ← Step4 占位
    └── Settings /settings
```

已移除独立 `/charts`、`/pipeline`（重定向到 workspace）。详见 [navigation.md](../design/ia/navigation.md)。

### 5.2 产品原则

1. **工作台优先，对话辅助**：默认进 Workspace；Agent 对话增强拆解与改参，不替代图表与参数可见性。
2. **每一步可看见、可重跑**：Job / steps_trace 有状态；参数变更可见。
3. **图表讲故事**：K 线 + 买卖/再平衡 + 权益/基准联动；吸收终端级指标与画线，服务研究而非下单。
4. **入门友好的诚实**：暴露成本、区间、过拟合风险；禁止「稳赚」话术。
5. **本地可玩、云上可部署**：开发可用 SQLite；生产可迁 Cloud Run（工程细节不在本 PRD 展开）。

视觉：研究工作台 / 克制信息密度；Zinc 中性 + Blue 强调；中英可切换。

---

## 6. Success Metrics

| 指标 | 目标（定性 / 初期） |
| --- | --- |
| 首次成功回测 | 新用户按旅程 A 可独立完成（≈15 分钟，无需写代码） |
| 摸底可用 | 能在 Market 完成：选标的 → 看日/周 K 与指标 → 画线刷新仍在 → 读右栏画像 |
| 理解感 | 用户能用自己的话复述「策略规则 + 一个主要风险」 |
| 迭代 | 同会话内至少完成 2 次参数变更，并在 Diff 看到差异 |
| 信任 | 结果区始终暴露成本/区间/基准；无「黑箱只给结论」 |
| Lab 不退化 | 开通看盘能力后，模板回测 / KPI / 基准 / M9 解读仍可用 |
| 压力研究 | 用户可开启蒙特卡洛（M6）并理解分位/路径是压力工具而非预测保证 |

Guardrail：不引入实盘下单入口；不弱化诚实提示。

---

## 7. Requirements & Journeys

优先级：P0 必须有闭环；P1 明显增强；P2 可后置。细节契约见 Step2 规格与 OpenAPI，本节省产品语言。

### 7.1 账户与工作区（P0）

- 邀请码注册 + 登录；Lazy auth：游客可逛可跑回测（`X-Guest-Session`）
- 个人 / 游客会话数据隔离
- 可选自备 LLM Key；否则服务端配置（UI 标明）

### 7.2 看盘摸底（P0，Step2）

- Watchlist：搜索、分组、行情摘要
- 日/周 K；WASM 指标（主/副/侧，含 Volume Profile 等）
- 画线：Trend / Fib / Rect / Horiz，按标的持久化
- 右栏标的画像：基本面与波动特征

### 7.3 实验室对话 + 模板回测（P0）

- 预设模板：买入持有、60/40、趋势+波动目标、空白/对话搭
- 自然语言拆成流水线步骤；进度可见；失败可重试
- Agent 不可静默改历史数据或跳过成本假设

### 7.4 数据与策略积木（P0）

- 默认宇宙：美股流动性 ETF + 常见指数类；支持 ticker 拉取；fixture 可降级
- 能力覆盖：DataFetch → Indicators → PortfolioOptimize → Rebalance → Backtest → SignalDaily → Report
- **蒙特卡洛（P1，产品承诺）**：回测后多路径压力；分位权益与深回撤等入门可读结果；与图上轻量 WASM MC 区分权威性（后端 M6 为准）
- RV/ML（P1）：进阶入口，非首次必经

### 7.5 结果、图表与对比（P0/P1）

- KPI：收益、年化、波动、最大回撤、夏普；vs SPY 等基准
- 权益/回撤；Trade Log；AI 三段式解读 + 诚实提示
- 图上：买卖点、Logs/Pred 开关；预测图层 band/line/regime（契约已有，完整渲染为 Step2 收尾）
- Diff：多 Run 参数差、KPI、净值叠加（P0/P1 交界，主链路已通）

### 7.6 关键用户旅程

**旅程 A — 入门者第一次成功**

1. 打开 Workspace（可游客）→ 可选登录  
2. Market：选 `SPY` 等看 K 线/指标，或直接 Lab 选「趋势 + 波动目标」  
3. 确认参数 → 运行 → 看 KPI / 图 / AI 解读  
4. 改波动目标再跑 → Diff  

**验收**：全程无需写代码；15 分钟内完成首次回测+解读。

**旅程 B — 研究者摸底再验证**

1. Watchlist 摸底 → 画线标注 →（可选）加入组合假设  
2. Lab 回测 → 点 Trade Log / 预测层复盘回撤段  
3. 开蒙特卡洛看路径压力 → 克隆参数再对比  

**验收**：摸底与回测同屏可切换；两次 run 差异可见。

### 7.7 Epic hypothesis（产品）

我们相信：在对话/模板回测之上提供「终端级摸底可视化 + 图上复盘 + Diff + 蒙特卡洛」，个人研究者与入门者能更快完成可解释的假设迭代，且不会误用为实盘终端。成功看 §6 旅程指标与 Step2 DoD。

---

## 8. Out of Scope（边界）

### 要写进产品预期（研究向）

- 日/周 K、常用与进阶指标、主副图、Volume Profile  
- 自由画线并按标的持久化  
- Watchlist 摸底、标的画像  
- Trade Log / 预测图层叠图讲故事  
- Run Diff、模板回测、AI 解读  
- **蒙特卡洛**多路径压力（研究工具）  
- 可选 RV/ML 进阶实验  

### 明确不做（终端向 / v1）

- 实盘交易、券商 API、跟单  
- WebSocket 实时 tick、Level-2 / Footprint / CVD  
- 自定义指标脚本（Pine 类）  
- 多屏专业布局、期权链交易面板  
- 全自动无人值守「日赚 X%」机器人  
- 复杂机构权限 / SSO（可后接 IAP，不进 v1 体验）  

---

## 9. Dependencies & Risks

| 依赖 | 说明 |
| --- | --- |
| 行情 | `yfinance` Live + 缓存；失败时 fixture 降级 |
| 前端指标 | wickra-wasm + `crates/quant-wasm` |
| LLM | Gemini 主/lite；DeepSeek 可选；无 Key 时规则回退 |
| 契约 | `packages/contracts` OpenAPI；PredictionOverlay 前后端一致 |

| 风险 | 缓解 |
| --- | --- |
| 用户把研究台当交易终端 | 文案免责声明；Out of Scope 明确；无下单入口 |
| 预测图层/Log 联动未完成导致「讲不清」 | Step2 收尾优先；UI 标明部分能力 |
| 指标过多压矮副图 | 自适应高度 + 引导关闭；不把全目录当 P0 KPI |
| 云托管冷启动/内存（旧课设部署） | 与当前 Lab 叙事脱钩；Cloud 阶段单独验收 |

---

## 10. Open Questions

- 🔵 预测图层完整 band/line/regime 渲染与 Trade Log 双向高亮的验收标准细节（见 [05](./reports/05-step2-progress.md)）  
- 🔵 是否增加 1M 周期（规格曾列；现状仅 1D/1W）  
- 🔵 Custom Watchlist 重度编辑 UX 做到哪一档  
- 🔵 Step3 ideas / Step4 Signals 的最小可用定义  
- 🔶 默认 UI 语言 en vs zh：以 [navigation.md](../design/ia/navigation.md) 为准（默认 en）  

---

## 11. 交付分期

| 阶段 | 用户得到什么 | 状态 |
| --- | --- | --- |
| **Step 1** | 工作台合流：模板回测、KPI/基准、M9 解读、Runs、Lazy auth | **已交付** |
| **Step 2** | Activity Bar；看盘/指标/画线；Trade Log 与预测图层；Run Diff；M6/M8 可开关 | **进行中**（2.1 基本完成；2.2/2.3 主链路已通） |
| **Step 2 收尾** | 图上完整预测渲染；Trade Log 时间轴对齐 + 双向高亮；DoD 扫尾 | **近期待办** |
| **Step 3** | 灵感 / ideas 从桩到可用 | **未来** |
| **Step 4** | Signals 日频订阅从占位到可用 | **未来** |
| **Cloud** | 稳定托管、个人数据持久、自带 Key 体验 | **未来** |

工程拆分与 API 细节见 Step 规格 / 进度报告与仓库内工程计划；本 PRD 只锁产品预期。

---

## 12. 文案与教学语气

- 指标首次出现给一句人话定义  
- Agent：结论 → 依据 → 可执行下一步  
- 禁止保证收益或暗示实盘建议；页脚固定研究免责声明  

---

## 13. 相关文档

| 文档 | 用途 |
| --- | --- |
| 本文件 | 产品做什么、边界、分期与成功标准 |
| [Step2 规格](./step2-market-workspace-spec.md) | 看盘一体工作台交互与契约 |
| [Step2 进度](./reports/05-step2-progress.md) | 完成度、缺口、截图 |
| [ChartWorkspace](./chart-workspace.md) / [WASM 指标](./wasm-indicator-engine.md) | 图表与指标实现说明 |
| [design/ia/navigation.md](../design/ia/navigation.md) | 导航与命名 |
| [legacy/ASSETS.md](../legacy/ASSETS.md) | 旧 RV / Streamlit 资产索引（非本产品表面） |
