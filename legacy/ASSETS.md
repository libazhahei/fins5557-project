# Legacy asset index

Assets from the **FINS5557 RV Prediction Pipeline / Streamlit** era. They are **not** the Quant Lab monorepo product surface. Keep for teaching reference and migration into `packages/quant` (especially M8); do not add features here.

| Asset | Path | What it is | Relation to Quant Lab |
| --- | --- | --- | --- |
| Streamlit + RV pipeline code | [`project/`](./project/) | Old app: yfinance → features → Optuna/ML → Streamlit workbench | Research kernels may be ported into `packages/quant`; UI is retired |
| Old root README | [`README-rv-pipeline.md`](./README-rv-pipeline.md) | Long tutorial for the RV pipeline, Colab, Cloud Run notes | Superseded by repo root [`README.md`](../README.md) |
| Offline teaching-pack optimization | [`OPTIMIZATION.md`](./OPTIMIZATION.md) | Precompute Parquet packs + disk cache for Streamlit/`project/` | New Lab uses Job artifacts + object store; do not mix cache semantics |
| Example experiment artifacts | [`../example_runs/`](../example_runs/) | config / data / model / plots from a prior RV run | Demo outputs only; left at repo root (large); not Lab Run storage |
| Local ad-hoc screenshots | `var/screenshots/` (gitignored / local) | Older UI captures | Prefer [`docs/screenshots/step2/`](../docs/screenshots/step2/) for current product |

## Current product docs (not legacy)

| Doc | Path |
| --- | --- |
| Product entry | [`../README.md`](../README.md) |
| Docs index | [`../docs/README.md`](../docs/README.md) |
| PRD | [`../docs/PRD.md`](../docs/PRD.md) |
| Step2 progress + screenshots | [`../docs/reports/05-step2-progress.md`](../docs/reports/05-step2-progress.md) |
