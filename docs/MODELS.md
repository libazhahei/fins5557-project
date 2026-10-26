# LLM model policy

| Role | Provider | Model | When |
| --- | --- | --- | --- |
| **Primary** | Google (`google` / Gemini) | `gemini-3.8-flash` | Lab agent, report narrative |
| **Lite** | Google | `gemini-3.1-flash-lite` | Automated tests, cheap smoke, **context compaction** |
| **Alt** | DeepSeek | `deepseek-chat` (override via env) | User-selectable in Lab UI; wired through Pi SDK + OpenAI-compatible fallback |

Environment (see [`.env.example`](../.env.example)):

```text
LLM_DEFAULT_PROVIDER=google
LLM_PRIMARY_MODEL=gemini-3.8-flash
LLM_LITE_MODEL=gemini-3.1-flash-lite
LLM_DEEPSEEK_MODEL=deepseek-chat
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

`apps/api` `GET /health` → `models`  
`apps/agent` `GET /health` → `models` + `pi` probe + which keys are present.

Agent stack:

1. Probe / warm **Pi SDK** (`@earendil-works/pi-coding-agent` + `pi-ai`) with DeepSeek/Gemini runtime keys.
2. Execute quant tools via HTTP against the API (reliable across Pi versions).
3. If no API keys: offline rule fallback can still run the `trend_vt` template when asked.
