export type RunFormState = {
  templateId: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  targetVol: number;
  maWindow: number;
  rebalance: string;
  costBps: number;
  benchmark: string;
  enableMc: boolean;
  enableRv: boolean;
};

export const DEFAULT_FORM: RunFormState = {
  templateId: "trend_vt",
  symbols: ["SPY", "QQQ", "IEF", "TLT", "GLD"],
  startDate: "2020-01-01",
  endDate: "2025-12-31",
  targetVol: 10,
  maWindow: 200,
  rebalance: "Monthly",
  costBps: 5,
  benchmark: "SPY",
  enableMc: false,
  enableRv: false,
};

export type ActivityMode = "market" | "lab" | "diff";

export type RightTab = "ticker" | "trades" | "ai" | "diff";

export type ChartTradeLogMarker = {
  id: string;
  timestamp: string;
  symbol: string;
  action: "BUY" | "SELL" | "REBALANCE" | "STOP_LOSS" | string;
  price: number;
  shares_delta?: number | null;
  weight_before: number;
  weight_after: number;
  reason_short: string;
  reason_detail: string;
};

export type PredictionOverlay = {
  id: string;
  name: string;
  model_source: string;
  target_pane: "main_price" | "sub_volatility" | string;
  render_type: "band" | "line" | "regime_bg" | "markers" | string;
  style?: {
    primary_color?: string;
    fill_opacity?: number;
    line_style?: "solid" | "dashed";
  };
  band_series?: Array<{
    timestamp: string;
    mid?: number;
    upper_1sigma: number;
    lower_1sigma: number;
    upper_2sigma?: number;
    lower_2sigma?: number;
  }>;
  line_series?: Array<{ timestamp: string; value: number; label?: string }>;
  regime_spans?: Array<{
    start_time: string;
    end_time: string;
    regime_type: string;
    label: string;
  }>;
};

export type TickerOverview = {
  symbol: string;
  name: string;
  asset_type: string;
  currency: string;
  data_source: string;
  quote: {
    last_price: number;
    change: number;
    change_pct: number;
    updated_at: string;
  };
  fundamentals: Record<string, number | null | undefined>;
  volatility_metrics: Record<string, number | null | undefined>;
  extra_sections: Array<{
    section_id: string;
    title: string;
    items: Array<{
      label: string;
      value: string | number;
      unit?: string;
      badge_tone?: string;
      tooltip?: string;
    }>;
  }>;
};

export type WatchlistGroup = {
  id: string;
  title: string;
  symbols: string[];
};
