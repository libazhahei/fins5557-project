/** Shared PredictionOverlay / TradeLog contracts (Step 2). */

export type PredictionRenderType = "band" | "line" | "regime_bg" | "markers";
export type TargetPaneType = "main_price" | "sub_volatility";

export interface PredictionOverlay {
  id: string;
  name: string;
  model_source: string;
  target_pane: TargetPaneType;
  render_type: PredictionRenderType;
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
  line_series?: Array<{
    timestamp: string;
    value: number;
    label?: string;
  }>;
  regime_spans?: Array<{
    start_time: string;
    end_time: string;
    regime_type: "low_vol" | "high_vol" | "bull" | "bear";
    label: string;
  }>;
}

export interface ChartTradeLogMarker {
  id: string;
  timestamp: string;
  symbol: string;
  action: "BUY" | "SELL" | "REBALANCE" | "STOP_LOSS";
  price: number;
  shares_delta?: number;
  weight_before: number;
  weight_after: number;
  reason_short: string;
  reason_detail: string;
}
