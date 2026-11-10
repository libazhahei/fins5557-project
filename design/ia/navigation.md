# Navigation and IA · Quant Lab

产品信息架构（Step 1 工作台合流后）。原则见 `.cursor/rules/core/design-core.mdc`。

- **Goal**：同一屏幕完成「假设 → 回测 → 带基准图表 → 人话报告」；历史与设置可深链回工作台。
- **UI 语言**：默认英文，可切换中文；标的代码保持英文。

## Sitemap

```text
Landing /
├── Login /login
└── App shell
    ├── Workspace /workspace?runId&compareIds   ← 默认研究画布（三栏）
    ├── Runs /runs                             ← 列表，打开深链回 workspace
    ├── Signals /signals                       ← Step4 占位
    └── Settings /settings
```

已移除独立页：`/charts`、`/pipeline`（重定向到 `/workspace`）。

| 导航标签 | 路由 | 用途 | 优先级 |
| --- | --- | --- | --- |
| Workspace / 实验室 | `/workspace` | 模板+参数 / 图表+KPI+M1–M9 / AI+对话 | P0 |
| Runs / 实验记录 | `/runs` | 历史列表 → `?runId=` | P0 |
| Signals / 今日信号 | `/signals` | 订阅策略日频占位 | Step4 stub |
| Settings / 设置 | `/settings` | 数据源、标的池、会话 LLM Key | P0 |

## Auth（lazy）

- Landing + Workspace 可逛；游客可跑回测（`X-Guest-Session`）。
- AI Agent、ideas 落库、订阅信号、个人 Key 持久意图 → 登录。

## 命名约定

| 概念 | EN | ZH |
| --- | --- | --- |
| 工作台 | Workspace | 实验室 |
| 一次实验 | Run | 实验 |
| 历史列表 | Runs | 实验记录 |
| 解读 | AI report | AI 三段式解读 |
