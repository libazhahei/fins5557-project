# Step 2 产品与技术规格书 · 交易看盘与策略一体化工作台 (Quant Lab)

| 项 | 内容 |
| --- | --- |
| **关联分支** | `phrase2` (基于 Step 1 Workspace 架构演进) |
| **日期** | 2026-11-11 |
| **实现进度** | 见 [Step2 进度报告](./reports/05-step2-progress.md)（Phase 2.1 基本完成；2.2/2.3 主链路已通、渲染与联动仍有缺口） |
| **核心目标** | 在保留 Step 1 三栏工作台骨架的基础上，引入最左侧 **Activity Bar（模式切换栏）**，融合「传统交易看盘（Watchlist + 专业画线 + 指标 + 基本面/波动率面板）」与「量化回测研究（Trade Log 图上联动 + 通用 AI 预测图层 + Run Diff）」。 |
| **技术关键词** | `react-resizable-panels`、`KlineCharts`、通用预测契约 (`PredictionOverlay`)、Schema-Driven Inspector、`yfinance` Live 缓存 |

---

## 1. 背景与定位（用户层面）

### 1.1 核心痛点

在 Step 1 完成「选模板 → 跑回测 → 看净值与解读」的单次闭环后，研究者在实际工作流中仍面临两个断点：

1. **研究前缺乏「单标的摸底」环境**：在构建组合前，用户需要像传统交易终端一样浏览 Watchlist、查看标的 K 线形态、叠加布林带（Bollinger Bands）、手动画趋势线/斐波那契回调，并查看公司 PE 等基本面与当前波动率水平。
2. **回测后缺乏「图上复盘与预测验证」**：跑完回测或 M8（RV/ML）模型后，用户需要在 K 线图上直观看到「具体哪一天因为什么 Log 触发了买卖」，以及「模型预测的未来价格上下轨/波动率走势」在图上的直观投影。

### 1.2 解决思路：Activity Bar 驱动的「双焦点」一体工作台

不拆分孤立的新路由页面，而是在 `/workspace` 最左侧新增一条固定宽度的 **Activity Bar（活动导航栏）**。在保留中栏（主画布）与右栏（检查器）容器不销毁的前提下，通过切换左侧 Panel 实现工作流的无缝流转：

* **流转 A（看盘 → 提假设）**：在「看盘模式」浏览 Watchlist → 查看某标的（如 `NVDA`）的布林带突破与波动率预测上下轨 → 手动画矩形框与趋势线标注 → 点击右栏「加入策略组合」→ 切回「策略实验室」一键跑组合回测。
* **流转 B（回测 → 查交易 Log）**：在「策略实验室」发现某段回撤较大 → 点击某笔交易 Log 或持仓标的 → 中栏 K 线自动定位到该标的对应时间戳，图上高亮展示买卖打点气泡、当时的布林带位置及预测图层。

---

## 2. 界面架构与交互规范（UI / UX）

整体延续 Step 1 的视觉规范：**Tailwind v4 Zinc 中性色 + Blue-600 强调色**，全站等宽字体栈（`JetBrains Mono` + `Noto Sans SC`），支持中英双语切换（`i18next`）。

### 2.1 整体四区布局（Activity Bar + 可拖拽三栏）

```text
+----+---------------------+------------------------------------------+------------------------+
| 活 | 左栏 (Left Panel)    | 中栏 (Center Canvas)                      | 右栏 (Right Inspector) |
| 动 | 随 Activity Bar 切换 | 顶栏：周期 / 指标(BOLL/MA) / 预测与Log开关 | 随当前焦点自动切换 Tab  |
| 栏 | (宽度 ~20%)          |------------------------------------------| (宽度 ~22%)            |
|    |                     | 左侧窄条：自由画线工具栏 (趋势/斐波那契/框) |                        |
| 💹 | [1. 看盘 Watchlist]  | 主图：K线 + 布林带 + 用户画线标注          | [Tab A: 标的画像]       |
| 看 | • Ticker 全局搜索    |       + 通用预测层 (上下轨锥形/曲线/底色)  | • 公司/ETF 基本面(PE等) |
| 盘 | • 自选分组列表       |       + Trade Log 买卖打点与原因气泡       | • 波动率特征 (HV/ATR)  |
|    | • 当前 Run 持仓标的  |------------------------------------------| • 扩展数据插槽 (Future) |
| 🧪 |                     | 副图 1：成交量 (VOL) / 波动率预测序列 (RV)  |                        |
| 策 | [2. 策略实验室]      |------------------------------------------| [Tab B: 回测与日志]     |
| 略 | • 预设模板与参数表   | 副图 2：组合净值 vs SPY (策略模式下展开)   | • 图表联动 Trade Logs  |
|    | • M6 / M8 开关      |------------------------------------------| • AI 三段式解读 / Diff |
| 🔀 | • 最近 Runs 与对比   | 底部：M1–M9 步骤状态与耗时轨迹条           | • Agent 对话           |
+----+---------------------+------------------------------------------+------------------------+

```

### 2.2 各区域详细设计

#### (1) 最左侧 Activity Bar (`48px` 固定宽)

* **💹 看盘 (Market & Watchlist)**：聚焦单标的行情、画线、基本面与量化特征。
* **🧪 实验室 (Strategy Lab)**：聚焦 Step 1 的组合回测参数、模板、M6/M8 开关与最近 Runs。
* **🔀 对比 (Run Diff)**：快捷唤起多次回测的并排指标与净值对比视图。
* **底部快捷入口**：语言切换 (`EN/中文`)、数据源状态指示灯 (`Fixture / Live Yahoo`)、设置 (`/settings`)。

#### (2) 左栏模式一：Watchlist 与搜索面板

* **全局搜索框**：支持按 Ticker 代码或公司名称搜索（支持本地 Fixture 标的 + Live Yahoo 动态拉取标的）。
* **分组列表**：
* `Current Run Universe`（当前回测包含的标的，方便跑完回测后逐个点击复盘）。
* `Core ETFs`（默认核心池：`SPY`, `QQQ`, `IEF`, `TLT`, `GLD`, `SHY`）。
* `Custom Watchlist`（用户自选股，支持增删排序）。


* **列表项信息**：`Symbol`、最新价 (`Last`)、日涨跌幅徽章 (`Chg %`)、当前波动率状态小点。

#### (3) 中栏：超级图表画布 (Super Chart Canvas)

* **顶部工具条 (Chart Header)**：
* 当前标的与周期切换：`1D` / `1W` / `1M`。
* **技术指标下拉/开关**：主图指标（`BOLL 布林带`、`MA`、`EMA`）、副图指标（`VOL`、`ATR`、`RSI`、`MACD`）。
* **量化叠加层开关 (Quant Overlays)**：
* `[✓] Trade Logs`（显示/隐藏回测买卖打点与调仓记录）
* `[✓] Predictions`（显示/隐藏模型预测图层，支持勾选具体模型如 `M8 RV Cone`、`Price Forecast`）




* **左侧画线工具栏 (Drawing Sidebar)**：
* 交互式画线工具：十字光标、**任意拖拽趋势线 (`trendLine`)**、射线、水平支撑/阻力线、**斐波那契回调线 (`fibonacciLine`)**、**矩形高亮框 (`rect`)**、文字标注、磁吸开关、一键清除。


* **主副图联动**：
* 在「看盘模式」下，默认最大化展示「K 线主图 + 成交量/波动率副图」。
* 在「策略模式」下，展示「6 KPI 顶栏 + K 线主图 + 组合净值 vs SPY 曲线 + M1–M9 轨迹条」。



#### (4) 右栏：多维检查器 (Right Inspector)

采用 Tab 切换，并在点击不同对象时自动聚焦对应 Tab：

* **Tab 1：标的画像 (`Ticker Info`)** —— 当用户在左栏点击某个 Ticker 时默认激活：
* **头部卡片**：公司全称（如 `Apple Inc.` 或 `SPDR S&P 500 ETF Trust`）、行业/资产类型标签、最新价、快捷按钮 `[+ 加入当前策略标的池]`。
* **基本面参数卡 (`Fundamentals`)**：`Market Cap`（市值）、`P/E (TTM)`、`Forward P/E`、`P/B`、`Dividend Yield`（股息率）、`52W High/Low` 区间进度条（ETF 自动适配展示 `Expense Ratio`、`AUM`）。
* **波动率与风险卡 (`Volatility & Quant`)**：`20D HV`（20日年化历史波动率）、`60D HV`、`1Y Vol Percentile`（当前波动率历史分位进度条）、`ATR (14D)`、`Beta (vs SPY)`、`Max Drawdown (1Y)`。
* **动态扩展插槽 (`Extra Sections`)**：预留通用 Schema 渲染区，未来无需改前端布局即可叠加期权 IV、因子暴露、情绪评分或财报日历。


* **Tab 2：交易日志 (`Trade Logs`)**：
* 展示当前回测 `run_id` 下（可按当前选中 Ticker 过滤）的调仓与买卖记录表。
* **双向联动**：点击表格某一行，中栏 K 线平滑滚动并居中高亮对应日期的 K 线与图上 Log 气泡；反之，点击图上的买卖箭头，右栏表格自动滚动并高亮该条记录。


* **Tab 3：AI 解读与对比 (`AI Report & Diff`)**：
* 保留 Step 1 的 M9 三段式解读、诚实提示、Agent 对话，以及新增的多 Run 同屏 Diff 对比表。



---

## 3. 核心技术实现细节

### 3.1 图表与画线引擎选型：`KlineCharts`

为满足「任意拖拽趋势线、斐波那契回调、矩形框」以及原生「布林带 (BOLL)」计算的需求，中栏 K 线组件采用 **`klinecharts`**（TypeScript 原生支持、Canvas 高性能渲染、零冗余依赖）：

1. **内置技术指标**：
* 主图叠加布林带：`chart.createIndicator('BOLL', true, { id: 'candle_pane' })`（自动计算并绘制 Upper / Mid / Lower 三轨）。
* 副图指标：通过 `chart.createIndicator('VOL')` / `'ATR'` 动态增删副图。


2. **交互式画线实现**：
* 直接调用 `chart.createOverlay({ name: 'trendLine' | 'fibonacciLine' | 'rect' | 'horizontalStraightLine' })` 启动鼠标绘制流。
* 扩展注册自定义 `rect`（带半透明背景填充的矩形框）以便用户框选震荡区间或回撤段。


3. **画线持久化**：
* 监听画线完成与拖拽变更回调（`onDrawEnd`、`onPressedMoving`、`onRemoved`），提取坐标序列 `points: [{ timestamp, value }]` 与样式配置。
* 游客模式同步至 `localStorage`（Key: `ql_drawings_{symbol}`）；登录用户通过防抖同步至后端持久化接口。



### 3.2 通用预测图层架构 (`General Prediction Overlay Schema`)

为支持未来不断扩展的预测类型（如 **上下轨区间预测、价格轨迹预测、波动率数值预测、市场 Regime 状态预测**），前后端统一采用声明式的 `PredictionOverlay` 数据契约。前端仅根据 `render_type` 渲染图形，与具体算法模型解耦：

```typescript
// packages/contracts/src/predictions.ts
export type PredictionRenderType = "band" | "line" | "regime_bg" | "markers";
export type TargetPaneType = "main_price" | "sub_volatility";

export interface PredictionOverlay {
  id: string;                  // 唯一标识，如 "m8_rv_cone_5d" | "chronos_price_band"
  name: string;                // 图层开关显示名称，如 "AI 价格上下轨预测 (5D)"
  model_source: string;        // 模型标识，如 "M8_RV_ML" | "M6_MC" | "CUSTOM_ML"
  target_pane: TargetPaneType; // 渲染在主图 K 线还是副图指标区
  render_type: PredictionRenderType;
  style?: {
    primary_color?: string;    // 默认 #2563eb (Blue-600)
    fill_opacity?: number;     // 区间填充透明度，默认 0.15
    line_style?: "solid" | "dashed";
  };

  // 1. 上下轨/置信区间/预测锥 (render_type === "band")
  // 支持历史时间戳（样本外回溯）与未来时间戳（向最新 K 线右侧延伸）
  band_series?: Array<{
    timestamp: string;         // ISO 日期 YYYY-MM-DD
    mid?: number;              // 预测中枢/均值线
    upper_1sigma: number;      // 第一上轨 (如 68% 置信度或 +1 SD)
    lower_1sigma: number;      // 第一下轨
    upper_2sigma?: number;     // 第二上轨 (可选，如 95% 置信度或 +2 SD)
    lower_2sigma?: number;     // 第二下轨
  }>;

  // 2. 单线预测轨迹 (render_type === "line"，如预测目标价序列、副图未来 RV 曲线)
  line_series?: Array<{
    timestamp: string;
    value: number;
    label?: string;
  }>;

  // 3. 体制/状态背景色块 (render_type === "regime_bg"，如高波动预警区间)
  regime_spans?: Array<{
    start_time: string;
    end_time: string;
    regime_type: "low_vol" | "high_vol" | "bull" | "bear";
    label: string;             // 如 "High Vol Regime (Prob: 84%)"
  }>;
}

```

### 3.3 图上 Trade Log 标注契约 (`ChartTradeLogMarker`)

将回测产生的调仓与交易日志直接投影到 K 线主图上：

```typescript
export interface ChartTradeLogMarker {
  id: string;
  timestamp: string;           // 交易发生日期 YYYY-MM-DD
  symbol: string;
  action: "BUY" | "SELL" | "REBALANCE" | "STOP_LOSS";
  price: number;               // 成交价格（决定箭头在 K 线上的锚点高度）
  shares_delta?: number;
  weight_before: number;       // 调仓前权重，如 0.40
  weight_after: number;        // 调仓后权重，如 0.60
  reason_short: string;        // 图上胶囊简短文案，如 "Buy +20% (Vol Target)"
  reason_detail: string;       // Hover 气泡与右栏日志完整说明，如 "200D MA 趋势确认，20D HV 回落至 9.8%，触发加仓"
}

```

### 3.4 右栏标的画像契约 (`TickerOverviewResponse`)

兼顾现有核心字段与未来无限叠加能力：

```typescript
export interface TickerOverviewResponse {
  symbol: string;
  name: string;
  asset_type: "EQUITY" | "ETF" | "INDEX" | "CRYPTO";
  currency: string;
  data_source: "fixture" | "yahoo_live";
  quote: {
    last_price: number;
    change: number;
    change_pct: number;
    updated_at: string;
  };
  fundamentals: {
    market_cap?: number | null;
    pe_ttm?: number | null;
    pe_forward?: number | null;
    pb_ratio?: number | null;
    dividend_yield?: number | null;
    expense_ratio?: number | null; // ETF 专用
    week_52_high: number;
    week_52_low: number;
  };
  volatility_metrics: {
    hv_20d: number;            // 20日年化历史波动率
    hv_60d: number;            // 60日年化历史波动率
    hv_percentile_1y: number;  // 过去1年波动率分位数 (0~100)
    atr_14d: number;           // 14日均幅指标
    beta_spy?: number | null;  // 相对 SPY 的 Beta
    max_drawdown_1y: number;   // 近1年最大回撤
  };
  // 未来可扩展插槽：后端返回即自动渲染为新卡片
  extra_sections: Array<{
    section_id: string;
    title: string;             // 如 "期权隐含波动率 (Options IV)" 或 "因子暴露 (Factors)"
    items: Array<{
      label: string;
      value: string | number;
      unit?: string;
      badge_tone?: "neutral" | "positive" | "warning" | "danger";
      tooltip?: string;
    }>;
  }>;
}

```

---

## 4. 后端 API 扩展清单 (`apps/api` + `packages/quant`)

在 `packages/contracts/openapi/openapi.yaml` 中新增并实现以下端点：

| 方法与路径 | 功能说明 | 关键参数与返回 |
| --- | --- | --- |
| `GET /market/search` | 搜索 Ticker（合并本地 Fixture 与 Yahoo 搜索） | `?q=NVDA` → 返回匹配的 `symbol`, `name`, `asset_type` 列表 |
| `GET /market/tickers/{symbol}/overview` | 获取右栏标的画像（行情 + PE 基本面 + 实时计算的波动率特征） | 返回 `TickerOverviewResponse`（内置 24h 基本面缓存与 K 线实时波动率计算） |
| `GET /market/tickers/{symbol}/bars` | 获取单标的 K 线、技术指标及预测/Log 叠加层 | `?interval=1d&start=...&end=...&run_id=...&include_predictions=true` → 返回 `bars[]`, `trade_logs[]`, `prediction_overlays[]` |
| `GET / PUT /market/watchlist` | 获取与更新用户 Watchlist 分组 | 支持 `X-Guest-Session` 隔离或 JWT 用户持久化 |
| `GET / PUT /market/drawings/{symbol}` | 获取与保存用户在该标的上的画线 JSON | 存储趋势线、斐波那契、矩形框的锚点坐标与样式 |
| `GET /runs/compare` | 落地 Step 1 预留的桩接口：多 Run 对比 | `?run_ids=id1,id2` → 返回参数差异 `param_diff`、指标对比表 `kpi_diff`、对齐净值序列 |

---

## 5. 分阶段实施路线（Step 2 研发拆解）

为了保证主分支随时可运行、可测试，Step 2 拆分为三个子阶段推进：

### Phase 2.1：工作台 Activity Bar 改造 + 看盘与画线主链路

1. **前端布局**：在 `/workspace` 左侧加入 `ActivityBar`，实现「💹 看盘 (Watchlist)」与「🧪 策略实验室」左栏无损切换。
2. **图表升级**：引入 `KlineCharts`，跑通日/周 K 线渲染、主图布林带 (`BOLL`) / `MA` 开关，以及左侧画线工具栏（任意拖拽趋势线、斐波那契回调、矩形框、水平线）与本地持久化。
3. **右栏画像与数据源**：后端打通 `yfinance` Live 缓存与本地 Fixture 降级，实现 `/market/tickers/{symbol}/overview`；前端落地右栏「标的画像（公司名、PE、20D/60D 波动率、扩展插槽）」。

### Phase 2.2：图上 Trade Log 双向联动 + 通用预测图层渲染

1. **Trade Log 上图**：打通回测结果中的交易明细，在 K 线图上渲染买卖标记与原因气泡，实现「点击图上标记 ↔ 高亮右栏 Trade Log 表格」双向定位。
2. **通用预测渲染器 (`PredictionOverlay`)**：在 `KlineCharts` 上封装自定义 Overlay 渲染器，支持向最新 K 线右侧延伸绘制未来时间戳的**上下轨预测扇形 (`band`)**、**预测曲线 (`line`)** 与 **历史 Regime 背景色 (`regime_bg`)**。
3. **接入 M8 / M6**：将仓库原有的 RV/ML 预测与蒙特卡洛输出转换为 `PredictionOverlay` 标准格式并在图上展示。

### Phase 2.3：多 Run Diff 对比闭环与测试收尾

1. **同屏 Diff**：实现 `/runs/compare` 前后端联通，在右栏或对比视图中展示两次实验的参数差异、6 大核心指标对比及净值叠加。
2. **自动化测试**：补充 Vitest 前端组件测试（mock `KlineCharts` 画布）与后端 `pytest` 契约测试（校验 `overview` 与 `PredictionOverlay` Schema）。

---

## 6. 验收标准 (Definition of Done)

1. **看盘与参数摸底**：用户可在不离开 `/workspace` 的情况下，通过左侧 Activity Bar 切到 Watchlist，搜索并点击任一标的，同屏看到 K 线、布林带、右侧公司名称/PE/波动率数据。
2. **自由画线**：用户可在 K 线图上自由拖拽绘制趋势线、斐波那契回调线、矩形框，刷新页面后画线标注依然保留。
3. **图上看预测与 Log**：当关联某次 Run 或开启预测开关时，K 线图上能清晰显示历史买卖 Log 气泡（点击可与右栏表格联动）以及标准化的预测图层（如上下轨区间或波动率曲线）。
4. **回测联动不退化**：切回「策略实验室」图标，Step 1 原有的模板选择、内联改参、跑回测、SPY 基准对比与 AI 三段式报告功能 100% 正常工作。
