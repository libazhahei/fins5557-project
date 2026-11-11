# Step 1 进度报告 · Quant Lab Workspace Upgrade

**分支**：`phrase2`  
**状态**：Step 1 核心 DoD 已落地（前端工作台 + 后端契约 + Step 2–4 桩）  
**日期**：2026-11-11

---

## 1. 本阶段目标（回顾）

| 主题 | 痛点 | 目标 |
| --- | --- | --- |
| 工作台合流与单次闭环 | 页面跳转割裂、即点即跑无确认、无基准对比、屏效极低 | 同屏看清假设 → 跑回测 → 带基准图表 + 人话报告 |
| 接口预留 | 后续 Step 2–4 怕拆骨架 | UI Placeholder + OpenAPI/Schema Stub 一次性占位 |

额外约束（访谈锁定）：

- 中英可切换（默认 **en**）
- 三栏可拖拽调节宽度
- Tailwind v4 + Zinc/Blue；全站等宽（JetBrains Mono + Noto Sans SC）
- Lazy auth：游客可逛可跑回测；AI / 长期保存需登录

---

## 2. 已完成

### 2.1 前端（`apps/web`）

| 项 | 说明 |
| --- | --- |
| 路由 | `/` Landing · `/workspace` · `/runs` · `/settings` · `/signals`；`/charts` `/pipeline` 重定向到 workspace |
| 三栏工作台 | `react-resizable-panels` v4（`Group`/`Panel`/`Separator`），栏宽持久化 |
| i18n | `i18next` + `react-i18next`；`en` / `zh-CN`；顶栏切换；偏好 `localStorage` |
| 样式 | Tailwind v4；Zinc 中性 + `blue-600`；去掉旧米色主题与 Newsreader |
| 左栏 | 模板、Medium 灵感草稿弹窗（Step3 桩）、内联参数表、M6/M8 锁开关、Run、最近 Runs + 对比勾选 |
| 中栏 | 6 KPI（含 vs SPY）、K 线 + equity/基准双图、买卖 markers、M1–M9 横向轨迹条 |
| 右栏 | AI 三段式 / Trade log 桩 / Diff 桩；一键改参重跑；Agent 对话（登录门控） |
| Auth UX | Landing 极简壳；Workspace 可逛；游客 Run OK；ideas / subscribe / Agent → `/login?next=` |
| 验证 | `pnpm test`、`pnpm build` 通过 |

### 2.2 后端（`apps/api` + `packages/quant`）

| 项 | 说明 |
| --- | --- |
| 参数化回测 | `POST /runs/from-template`：`template_id`、symbols、日期、cost、`strategy_params`、`enable_mc`/`enable_rv_ml`、`locale` |
| Fixture 校验 | 非法标的 → **400** 明文错误 |
| 游客会话 | `X-Guest-Session`；Run 挂系统 `__guest__` + `guest_session_id` 隔离 |
| M5 | 策略净值 + SPY 基准指标/曲线；markers 完整字段（可有 null） |
| M9 | `summary.narrative`：`headline` / `attribution` / `honest_warnings` / `next_actions`（en/zh） |
| `steps_trace` | M1–M9 状态与耗时；M6/M8 为 placeholder / not_implemented |
| 桩接口 | `POST/GET /ideas`、`GET /runs/compare`、`POST /runs/{id}/subscribe`、`GET /signals/daily` |
| `/ready` | 数据源 / LLM / feature stub 状态 |
| Agent | 透传 `X-User-LLM-Key` / `X-User-LLM-Provider` |
| OpenAPI | [`packages/contracts/openapi/openapi.yaml`](../../packages/contracts/openapi/openapi.yaml) 已扩到 Step1 表面 |
| Fixture 路径 | [`paths.fixture_prices_dir()`](../../apps/api/src/quant_lab_api/paths.py) 兼容 src / 安装布局 |

### 2.3 设计文档

- [`design/ia/navigation.md`](../../design/ia/navigation.md) — Landing + Workspace 中心 IA  
- [`design/tokens/colors.md`](../../design/tokens/colors.md) — Zinc / Blue  
- [`design/tokens/typography.md`](../../design/tokens/typography.md) — 等宽栈  
- 根 [`pyproject.toml`](../../pyproject.toml) — `uv sync` 默认安装 workspace 成员（api/quant/worker）

---

## 3. 本地怎么开

```bash
# 依赖（Makefile 默认用 .venv-lab）
make sync

# 数据库二选一：
# A) Postgres
make up-db
# B) SQLite：把 .env 中 DATABASE_URL 改为
#    DATABASE_URL=sqlite+pysqlite:///./var/quantlab.db
#    mkdir -p var

make api    # :8080
make web    # :5173  → http://localhost:5173
# 可选（Agent 对话）
make agent  # :8081
```

注意：若 `.env` 仍是 `postgresql+psycopg://…@localhost:5432/quantlab` 而 Docker 未起，`make api` 会在 startup 连库失败。

---

## 4. 关键决策记录

| 决策 | 选择 |
| --- | --- |
| Step 范围 | 完整 Step 1 DoD（FE+BE+桩），非仅 UI 壳 |
| 分栏 | `react-resizable-panels`（不自研） |
| i18n | i18next；默认英文；报告语言跟 UI `locale` |
| 工作台路径 | `/workspace`（不用历史 `/lab`） |
| 配色 | Tailwind Zinc + Blue-600（不用自造米色） |
| 字体 | CDN：JetBrains Mono + Noto Sans SC |
| 游客 | 可跑回测（会话级 guest）；不可 AI / ideas / 订阅 |

---

## 5. 明确未做（后续 Step）

| Step | 内容 |
| --- | --- |
| 2 | Activity Bar + 看盘/画线 + 标的画像；Trade Log 图上联动；通用预测图层；Run Diff；MC(M6)/RV(M8) 真跑 — 详见 [Step2 规格](../step2-market-workspace-spec.md) |
| 3 | Medium → DSL 动态解析与策略组装（现仅草稿落库） |
| 4 | 日频行情 + 16:30 调仓信号引擎（现仅订阅占位页） |

---

## 6. 已知注意点

1. **venv**：`make` 使用 `UV_PROJECT_ENVIRONMENT=.venv-lab`；裸 `uv sync` 在修好根依赖后会装成员包，但仍建议用 `make sync`。  
2. **site-packages**：editable/force-include 安装后，改 `apps/api/src` 后需 `uv sync` / 重装，或开发时依赖 `pythonpath`（pytest 已配置）。  
3. **jsdom**：Vitest 中 mock 了 `react-resizable-panels`（真实浏览器可拖拽）。

---

## 7. 建议下一步

1. 确认本机用 Postgres（`make up-db`）还是 SQLite，稳定起 `make api` + `make web`。  
2. 在 Workspace 跑一遍模板 → KPI/基准图/解读/改参重跑闭环。  
3. 按 [Step2 规格](../step2-market-workspace-spec.md) 进入 Step 2（Phase 2.1：Activity Bar + 看盘/画线主链路），或先修启动/文档体验。
