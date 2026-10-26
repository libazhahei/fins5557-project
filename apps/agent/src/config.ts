export const config = {
  port: Number(process.env.PORT ?? 8081),
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:8080",
  serviceSharedSecret: process.env.SERVICE_SHARED_SECRET ?? "dev-shared-secret-change-me",
  /** Primary lab model (Gemini) */
  primaryModel: process.env.LLM_PRIMARY_MODEL ?? "gemini-3.8-flash",
  /** Tests + context compaction */
  liteModel: process.env.LLM_LITE_MODEL ?? "gemini-3.1-flash-lite",
  deepseekModel: process.env.LLM_DEEPSEEK_MODEL ?? "deepseek-chat",
  defaultProvider: (process.env.LLM_DEFAULT_PROVIDER ?? "google").toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  agentDir: process.env.PI_AGENT_DIR ?? "./var/pi-agent",
};
