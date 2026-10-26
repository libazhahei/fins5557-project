# Legacy Streamlit app

The previous FINS5557 Streamlit + RV pipeline lives in [`project/`](./project/).

New development targets the monorepo:

- `apps/web` — React
- `apps/api` / `apps/worker` / `apps/agent`
- `packages/quant` — modular M1–M9

Do not add features here; port logic into `packages/quant` instead.
