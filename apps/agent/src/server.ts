import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { config } from "./config.js";
import { runFallbackAgent } from "./llm_fallback.js";
import { probePi, tryCreatePiSession } from "./pi_session.js";

type SessionState = {
  id: string;
  provider: string;
  model: string;
  userId?: string;
  history: { role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }[];
  listeners: Set<(ev: Record<string, unknown>) => void>;
  userToken?: string;
};

const app = new Hono();
const sessions = new Map<string, SessionState>();

function requireService(c: { req: { header: (n: string) => string | undefined } }) {
  const secret = c.req.header("x-service-secret");
  if (secret !== config.serviceSharedSecret) {
    return false;
  }
  return true;
}

app.get("/health", async (c) => {
  const pi = await probePi();
  return c.json({
    status: "ok",
    service: "agent",
    version: "0.1.0",
    models: {
      primary: config.primaryModel,
      lite: config.liteModel,
      lite_roles: ["test", "context_compact"],
      deepseek: config.deepseekModel,
      default_provider: config.defaultProvider,
    },
    pi,
    api_base_url: config.apiBaseUrl,
    keys: {
      gemini: Boolean(config.geminiApiKey),
      deepseek: Boolean(config.deepseekApiKey),
    },
  });
});

app.get("/ready", (c) => c.json({ status: "ready" }));

app.post("/sessions", async (c) => {
  if (!requireService(c)) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{
    session_id?: string;
    provider?: string;
    model?: string;
    user_id?: string;
  }>();
  const id = body.session_id || crypto.randomUUID();
  const provider = (body.provider || config.defaultProvider).toLowerCase();
  const model =
    body.model ||
    (provider === "deepseek" ? config.deepseekModel : config.primaryModel);
  sessions.set(id, {
    id,
    provider,
    model,
    userId: body.user_id,
    history: [],
    listeners: new Set(),
  });
  // Warm Pi if possible (non-fatal)
  await tryCreatePiSession({ provider, model }).then((h) => h?.dispose());
  return c.json({ id, pi_session_id: id, provider, model });
});

app.post("/sessions/:id/messages", async (c) => {
  if (!requireService(c)) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const state = sessions.get(id);
  if (!state) return c.json({ error: "session not found" }, 404);
  const body = await c.req.json<{
    message: string;
    provider?: string;
    model?: string;
    user_token?: string;
  }>();
  if (body.provider) state.provider = body.provider.toLowerCase();
  if (body.model) state.model = body.model;
  if (body.user_token) state.userToken = body.user_token;

  const emit = (ev: Record<string, unknown>) => {
    for (const l of state.listeners) l(ev);
  };

  // Prefer Pi prompt when session can be created; still use HTTP tools via fallback
  // for reliable quant actions (Pi customTools API differs across versions).
  const pi = await tryCreatePiSession({ provider: state.provider, model: state.model });
  let text = "";
  if (pi) {
    emit({ type: "pi", status: "started" });
    try {
      // Best-effort: if Pi supports prompt, use it for narrative; tools via fallback after.
      if (typeof pi.session.prompt === "function") {
        const unsub = pi.session.subscribe?.((event: any) => {
          emit({ type: "pi_event", event });
        });
        await pi.session.prompt(
          `${body.message}\n\n(Note: use Quant Lab templates via the API tools in the host; keep answers in Chinese.)`,
        );
        text = pi.session.getLastAssistantText?.() || "";
        unsub?.();
      }
    } catch (e) {
      emit({ type: "pi_error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      pi.dispose();
    }
  }

  const toolCtx = {
    apiBaseUrl: config.apiBaseUrl,
    userToken: state.userToken || "",
    serviceSecret: config.serviceSharedSecret,
  };

  const result = await runFallbackAgent({
    provider: state.provider,
    model: state.model,
    message: body.message,
    history: state.history,
    toolCtx,
    onEvent: emit,
  });
  state.history = result.history;
  if (!text) text = result.text;
  else text = `${text}\n\n---\n${result.text}`;

  emit({ type: "done", text });
  return c.json({ text, provider: state.provider, model: state.model });
});

app.get("/sessions/:id/events", (c) => {
  if (!requireService(c)) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const state = sessions.get(id);
  if (!state) return c.json({ error: "session not found" }, 404);

  return streamSSE(c, async (stream) => {
    const listener = async (ev: Record<string, unknown>) => {
      await stream.writeSSE({ event: String(ev.type || "message"), data: JSON.stringify(ev) });
    };
    state.listeners.add(listener);
    await stream.writeSSE({ event: "ready", data: JSON.stringify({ session_id: id }) });
    // keep alive until client disconnects
    const ping = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: "{}" });
    }, 15000);
    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });
    clearInterval(ping);
    state.listeners.delete(listener);
  });
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`quant-lab agent listening on :${info.port}`);
});
