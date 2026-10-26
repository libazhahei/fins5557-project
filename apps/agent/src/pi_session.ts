/**
 * Optional Pi SDK wiring (DeepSeek + Gemini). Falls back if packages/API differ.
 */

import { config } from "./config.js";

export type PiHandle = {
  mode: "pi" | "unavailable";
  detail: string;
};

let cached: PiHandle | null = null;

export async function probePi(): Promise<PiHandle> {
  if (cached) return cached;
  try {
    const piAgent = await import("@earendil-works/pi-coding-agent");
    const piAi = await import("@earendil-works/pi-ai");
    cached = {
      mode: "pi",
      detail: `pi-coding-agent + pi-ai loaded (${Object.keys(piAgent).slice(0, 5).join(",")}; ai:${Object.keys(piAi).slice(0, 5).join(",")})`,
    };
  } catch (e) {
    cached = {
      mode: "unavailable",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  return cached;
}

/** Try create a Pi session with DeepSeek or Google; return null to use fallback loop. */
export async function tryCreatePiSession(opts: {
  provider: string;
  model: string;
}): Promise<{ session: any; dispose: () => void } | null> {
  const probe = await probePi();
  if (probe.mode !== "pi") return null;
  try {
    const { createAgentSession, SessionManager, AuthStorage, ModelRegistry } = await import(
      "@earendil-works/pi-coding-agent"
    );
    const authStorage =
      typeof AuthStorage?.inMemory === "function" ? AuthStorage.inMemory() : undefined;
    if (authStorage?.setRuntimeApiKey) {
      if (config.deepseekApiKey) authStorage.setRuntimeApiKey("deepseek", config.deepseekApiKey);
      if (config.geminiApiKey) {
        authStorage.setRuntimeApiKey("google", config.geminiApiKey);
        authStorage.setRuntimeApiKey("gemini", config.geminiApiKey);
      }
    }
    const modelRegistry = ModelRegistry?.create?.(authStorage);
    let model =
      modelRegistry?.find?.(opts.provider, opts.model) ||
      modelRegistry?.find?.("deepseek", config.deepseekModel) ||
      modelRegistry?.find?.("google", config.primaryModel);

    if (!model) {
      try {
        const { getModel } = await import("@earendil-works/pi-ai");
        model = getModel(opts.provider as any, opts.model as any);
      } catch {
        /* ignore */
      }
    }
    if (!model) return null;

    const sessionManager = SessionManager?.inMemory?.() ?? undefined;
    const created = await createAgentSession({
      model,
      authStorage,
      modelRegistry,
      sessionManager,
      cwd: process.cwd(),
      agentDir: config.agentDir,
      // Prefer no destructive local tools by default; quant tools are HTTP in fallback.
      // Pi custom tools vary by version — if unsupported, caller uses fallback.
    });
    const session = created.session ?? created;
    return {
      session,
      dispose: () => {
        try {
          session.dispose?.();
        } catch {
          /* ignore */
        }
      },
    };
  } catch (e) {
    console.warn("[pi] createAgentSession failed, using fallback:", e);
    return null;
  }
}
