# Step 2 Workspace Screenshots

Captured from local `/workspace` on **2026-11-11** (viewport ≈ 1440×900).

## Verification set (click-through)

Live runs used for Lab / Diff:

| Run | Template | Sharpe (UI) |
| --- | --- | --- |
| `841aa697-…` | Trend + Vol Target | 0.31 |
| `5a1b8321-…` | Buy & Hold | 0.78 |

| File | Activity | Result |
| --- | --- | --- |
| [market-pred-verify.png](./market-pred-verify.png) | **Market** | Pred ON · `Pred 4` (research sketch + AI RV Cone / RV 5D / HV Regime) · `pred_vol` sub-pane · WASM series drawn |
| [lab-equity-verify.png](./lab-equity-verify.png) | **Lab** | Run KPIs · equity vs SPY · Logs/Pred ON · Trade log rows visible |
| [lab-pred-verify.png](./lab-pred-verify.png) | **Lab** | Earlier Pred path count check during wasm `from_idx` fix |
| [diff-verify.png](./diff-verify.png) | **Diff** | Two runs `#5a1b` vs `#841a` · equity overlay · Param Diff filled |

## Earlier capture set

| File | Activity | What it shows |
| --- | --- | --- |
| [market.png](./market.png) | **Market** | Watchlist · K-line + BOLL/SMA · ATR/HV · Vol Profile |
| [lab.png](./lab.png) / [lab-backtest.png](./lab-backtest.png) | **Lab** | Templates · params · M6/M8 · completed backtest |
| [lab-tradelog.png](./lab-tradelog.png) | **Lab** | Trade log tab with monthly_rebalance BUY/SELL rows |
| [diff.png](./diff.png) | **Diff** | Earlier two-run Param Diff |

Progress context: [`docs/reports/05-step2-progress.md`](../../reports/05-step2-progress.md).

### Known gap

Trade-log **axis markers** stay at 0 when Market K-line is on live/recent bars while the active run’s `trade_logs` are fixture dates (2020–2022). Table + Logs checkbox still work; chart↔table scroll needs overlapping bar timestamps.
