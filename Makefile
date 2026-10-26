.PHONY: sync up-db api web agent worker test health

UV_ENV ?= .venv-lab
export UV_PROJECT_ENVIRONMENT=$(UV_ENV)

sync:
	uv sync --all-packages
	pnpm install --config.strict-dep-builds=false
	pnpm approve-builds -y esbuild || true

up-db:
	docker compose up -d postgres

api:
	uv run uvicorn quant_lab_api.main:app --host 0.0.0.0 --port 8080 --reload

web:
	pnpm --filter @quant-lab/web dev

agent:
	pnpm --filter @quant-lab/agent dev

worker:
	uv run quant-lab-worker --health

test:
	uv run pytest -q
	pnpm --filter @quant-lab/web run lint
	pnpm --filter @quant-lab/web run test
	pnpm --filter @quant-lab/agent run lint
	pnpm --filter @quant-lab/agent run test


health:
	curl -s http://127.0.0.1:8080/health | python -m json.tool
	curl -s http://127.0.0.1:8081/health | python -m json.tool
