const TOKEN_KEY = "quantlab_token";
const GUEST_KEY = "quantlab_guest_session";
const LLM_KEY = "quantlab_llm_key";
const LLM_PROVIDER_KEY = "quantlab_llm_provider";
const UNIVERSE_KEY = "quantlab_universe";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getGuestSession(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function getLlmKey(): string {
  return localStorage.getItem(LLM_KEY) || "";
}

export function setLlmKey(key: string) {
  if (key) localStorage.setItem(LLM_KEY, key);
  else localStorage.removeItem(LLM_KEY);
}

export function getLlmProvider(): string {
  return localStorage.getItem(LLM_PROVIDER_KEY) || "google";
}

export function setLlmProvider(provider: string) {
  localStorage.setItem(LLM_PROVIDER_KEY, provider);
}

export function getUniverse(): string[] {
  try {
    const raw = localStorage.getItem(UNIVERSE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return ["SPY", "QQQ", "IEF", "TLT", "GLD", "SHY", "AAPL", "MSFT", "NVDA", "GOOG", "TQQQ"];
}

export function setUniverse(symbols: string[]) {
  localStorage.setItem(UNIVERSE_KEY, JSON.stringify(symbols));
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.set("X-Guest-Session", getGuestSession());

  const llmKey = getLlmKey();
  if (llmKey) {
    headers.set("X-User-LLM-Key", llmKey);
    headers.set("X-User-LLM-Provider", getLlmProvider());
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type Health = {
  status: string;
  models?: {
    primary: string;
    lite: string;
    deepseek_model?: string;
    default_provider?: string;
  };
};

export type Ready = {
  status: string;
  database: string;
  data_source?: {
    mode: string;
    fixture_ok?: boolean;
    fixture_symbols?: string[];
    live_yahoo?: string;
    policy?: string;
  };
  llm?: { primary: string; default_provider: string };
  features?: Record<string, string>;
};

export type Narrative = {
  headline: string;
  attribution: string;
  honest_warnings: string[];
  next_actions: { label: string; patch_params: Record<string, unknown> }[];
};

export type StepTrace = {
  module_id: string;
  name: string;
  status: string;
  duration_ms: number;
  io_summary?: string;
};

export type Run = {
  id: string;
  name: string;
  template: string | null;
  status: string;
  params: Record<string, unknown>;
  summary: Record<string, unknown> & { narrative?: Narrative };
  steps_trace?: StepTrace[];
  panel_uri?: string | null;
  is_subscribed_daily?: boolean;
  last_target_weights?: Record<string, number> | null;
  created_at?: string | null;
};

export type OverlayMarker = {
  time: number;
  symbol: string;
  action: string;
  weight_before: number | null;
  weight_after: number | null;
  price: number | null;
  fee_bps: number | null;
  reason: string | null;
};

export type ChartTradeLogMarker = {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;
  price: number;
  weight_before: number;
  weight_after: number;
  reason_short: string;
  reason_detail: string;
};

export type PredictionOverlay = {
  id: string;
  name: string;
  model_source: string;
  target_pane: string;
  render_type: string;
  band_series?: Array<Record<string, unknown>>;
  line_series?: Array<Record<string, unknown>>;
};

export type Overlays = {
  run_id: string;
  equity: { time: number; value: number }[];
  benchmark_equity: { time: number; value: number }[];
  markers: OverlayMarker[];
  trade_logs?: ChartTradeLogMarker[];
  prediction_overlays?: PredictionOverlay[];
  overlay_sources?: string[];
  mc_paths: unknown[];
  rv_predictions: unknown[];
  summary: Record<string, unknown>;
  panel_uri?: string | null;
};
