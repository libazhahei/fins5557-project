# Local development

## Layout

| Path | Role |
| --- | --- |
| `apps/web` | React + Vite (pnpm) |
| `apps/api` | FastAPI |
| `apps/agent` | Pi host (Node ≥22); Phase 0 health only |
| `apps/worker` | Job runner entry |
| `packages/quant` | M1–M9 quant modules |
| `packages/contracts` | OpenAPI |
| `legacy/project` | Old Streamlit app |

## Models

See [MODELS.md](./MODELS.md): **gemini-3.8-flash** (primary), **gemini-3.1-flash-lite** (tests + context compact), **DeepSeek** selectable in Lab (`DEEPSEEK_API_KEY`).


## First-time setup

```bash
cp .env.example .env
# Prefer a fresh venv name if .venv is locked by an old process:
export UV_PROJECT_ENVIRONMENT=.venv-lab
make sync
make up-db
```

Node 22 for the agent:

```bash
nvm use 22
```

## Run

```bash
make api      # :8080
make agent    # :8081
make web      # :5173  (proxies /api → api)
```

`GET /health` on api and agent reports the configured model pair.

## Tests

```bash
make test
```
