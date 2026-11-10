# 技术视角报告 · Quant Lab

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-27 |
| 依据 | 代码库、`docs/DEVELOPMENT.md`、`docs/MODELS.md`、重构计划、OpenAPI |
| 架构目标 | Agent-first monorepo：Web 只打 API；Pi Agent 经 tools 调 Python；长任务走 Job/Worker |

---

## 1. 系统上下文

```text
Browser (React/Vite :5173)
    │  /api proxy
    ▼
FastAPI (apps/api :8080)
    ├── Auth / Runs / Jobs / Bars / Agent proxy
    ├── Object store (local:// or future GCS)
    ├── DB (SQLite 默认 / Postgres 可选)
    └── HTTP tools target
            ▲
Pi Agent (apps/agent :8081, Node ≥22)
    └── Gemini / DeepSeek；离线规则回退

Worker (apps/worker) — 长任务入口（MC/训练等）；本地可 sync 执行
packages/quant — M1–M9 纯 Python 内核
packages/contracts — OpenAPI（当前偏 Phase 0 health，实现已超前于契约文档）
legacy/ — 原 Streamlit RV 教学应用
```

**对外原则**：浏览器不直连 agent；`api` 代理会话。禁止 WebSocket；推送最多 SSE。

---

## 2. Monorepo 与运行时

| 路径 | 技术栈 | 职责 |
| --- | --- | --- |
| `apps/web` | React + Vite + TS + pnpm；React Query；`lightweight-charts` | 实验室 / 图表 / runs / 流水线壳 / 设置 |
| `apps/api` | FastAPI + SQLAlchemy | 鉴权、编排、对象存储、代理 agent |
| `apps/agent` | Hono + Pi SDK（`@earendil-works/pi-*`） | 会话、LLM、tools → API |
| `apps/worker` | Python | Job 消费者 / 健康入口 |
| `packages/quant` | uv 包 `quant_lab` | M1–M9 模块与 runner |
| `packages/contracts` | OpenAPI YAML | 契约源（需与实现同步） |
| `deploy/docker` | Dockerfile.api/agent/worker | Cloud Run 镜像骨架 |
| `design/` | IA 定稿 + token 示例 | 产品/前端约束 |
| `.cursor/skills|rules` | PM skills、code-discipline 等 | 研发与产品协作辅助 |

包管理：**pnpm workspace**（JS）+ **uv workspace**（Python）。常用：`make sync` / `make api` / `make web` / `make agent` / `make test`。

---

## 3. 量化内核（G1：M1–M9）

统一契约：`JobSpec(job_type, params, input_uris)` → `JobResult(status, output_uris, metrics, error)`；由 `quant_lab.runner.run_job` 分发。

| ID | JobType | 职责 |
| --- | --- | --- |
| M1 | `data.fetch` | OHLCV；支持 fixture CSV / yfinance |
| M2 | `indicators.compute` | 趋势/波动等条件 |
| M3 | `portfolio.optimize` | 组合优化（如 HRP 类能力） |
| M4 | `rebalance.plan` | 目标权重 / 再平衡计划 |
| M5 | `backtest.run` | 回测（含 `trend_vt`、静态权重等） |
| M6 | `montecarlo.run` | 路径压力 |
| M7 | `signal.daily` | 研究用当日信号 |
| M8 | `rv.ml` | 原 RV 预测教学管线插拔点 |
| M9 | `report.build` | 表/图/LLM briefing |

**MVP 模板管线**（`services/pipeline.py`）：

| template id | 名称 | 典型路径 |
| --- | --- | --- |
| `buy_hold` | 买入持有基准 | fetch → backtest(static) |
| `sixty_forty` | 经典 60/40 | fetch → backtest(static 0.6/0.4) |
| `trend_vt` | 趋势 + 波动目标 | fetch →（指标/再平衡逻辑内嵌）→ backtest(trend_vt) |

默认 `use_fixtures=true` 走 `packages/quant/tests/fixtures/prices`，保证离线可演示。

---

## 4. API 面（实现现状）

路由挂载于 `quant_lab_api.main`：

| 区域 | 端点（代表） | 说明 |
| --- | --- | --- |
| 健康 | `GET /health`、`/ready` | 模型对、环境 |
| 鉴权 | `/auth/register`、`/auth/login` | 邀请码 + JWT |
| 实验 | `/runs/templates`、`POST /runs/from-template`、`GET /runs`、`GET /runs/{id}`、`.../overlays` | 模板跑批与摘要 |
| K 线 | `GET /bars` | 可带 `panel_uri` |
| Job | `/jobs` 相关 | 单步创建与（可选）立即执行 |
| Agent 代理 | `/agent/sessions`、消息 | 转发至 `:8081`，附服务密钥 |

配置见 `.env.example`：`DATABASE_URL`（默认 SQLite）、`OBJECT_STORE_URI`、`INVITE_CODE`、`JWT_SECRET`、`AGENT_BASE_URL`、`JOB_SYNC_DEFAULT`、Gemini/DeepSeek keys。

**存储**：本地对象存储适配器 + DB 中的 Run/Job/User；接口预留 Cloud SQL + GCS（重构计划 D2）。

---

## 5. Agent 与 LLM

| 角色 | 模型（策略） | 用途 |
| --- | --- | --- |
| Primary | `gemini-3.8-flash` | 实验室对话、报告叙事 |
| Lite | `gemini-3.1-flash-lite` | 测试、context compact |
| Alt | `deepseek-chat` | Lab UI 可选；Pi + OpenAI 兼容回退 |

执行策略（`apps/agent`）：

1. 尝试 Pi SDK 会话；  
2. **可靠路径**：HTTP tools 调 API（`list_templates` / `run_template` / `get_run` / `list_runs` / `create_job` 等）；  
3. 无 API Key 时：离线规则仍可跑 `trend_vt` 类请求。

会话内存态在 agent 进程内；生产需考虑粘性或多实例会话外置（Cloud 阶段议题）。

---

## 6. 前端技术实现

- 单页 `App.tsx`：路由对齐 IA（登录、实验室、图表、实验记录、流水线、设置）。
- 鉴权：`localStorage` JWT；`RequireAuth` 守卫。
- 图表：`ChartPanel` 基于 `lightweight-charts`，蜡烛 + 权益副轴；买卖点/regime 叠加仍薄。
- 构建：Vite；测试 Vitest；`/api` 代理到 8080。

---

## 7. 部署与运维约束

- **目标**：Cloud Run 三服务（api / agent / worker）+ Secret +（可选）Cloud SQL/GCS。  
- **现状风险（README 历史部署笔记）**：旧一体部署在 Cloud Run 2CPU/2GB 上出现冷启动清 workspace、OOM；新架构意图是拆服务与对象持久化，但 **GCP 切换演练（phase5）仍在路线图**。  
- 遗产优化文档 `OPTIMIZATION.md` 主要服务 **旧 Streamlit/RV 预计算包**；新 Lab 应以 Job 产物 URI + 对象存储缓存为准，避免两套缓存语义混用。

---

## 8. 质量与工程护栏

- 测试：`make test` → pytest（quant/api）+ web/agent lint/test。  
- 设计规则：`.cursor/rules/core` always-on；`binders/code-discipline` 在改 `py/ts/tsx/js/jsx` 时约束诚实与 LEVER。  
- PM skills：产品工件与发现流程可按需调用，不进入运行时。

---

## 9. 技术债与优先工程项

1. **OpenAPI 滞后**：契约仍像 Phase 0 health；应用 codegen/契约测试对齐真实路由。  
2. **Worker 异步化**：`JOB_SYNC_DEFAULT=true` 适合本地；MC/RV 需真正入队 + SSE 进度。  
3. **Overlays 完整化**：买卖点、再平衡标记、regime 着色与图表深链 `runId`。  
4. **流水线 UI**：从静态列表升级为 Job DAG 可视与单步重跑。  
5. **报告 M9**：人话三段式 + 风险提示，替代前端裸 JSON。  
6. **会话持久与多副本**：agent 内存 Map 不适合水平扩展。  
7. **Legacy 边界**：明确 `legacy/` 只读教学 vs `packages/quant` M8 迁移完成度。  
8. **安全**：邀请码/JWT 密钥、服务间 `SERVICE_SHARED_SECRET`、用户自备 Key 的存储与展示。

---

## 10. 建议的技术验收清单（相对 MVP）

- [ ] 注册登录 → 三模板均可离线 fixture 跑通  
- [ ] Run 列表与 overlays 权益曲线一致  
- [ ] Agent 在配置 Key 后能 `run_template` 并返回可读摘要  
- [ ] 无 Key 时 fallback 行为可预期、有文案说明  
- [ ] `make test` 绿；健康检查暴露正确模型对  
- [ ] Docker 三镜像可本地 compose 冒烟（即使尚未上 GCP）
