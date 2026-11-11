import type { PredictionOverlay } from "../workspace/types";

export type OhlcvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type IndicatorId =
  | "sma"
  | "ema"
  | "wma"
  | "macd"
  | "bbi"
  | "sar"
  | "rsi"
  | "kdj"
  | "wr"
  | "cci"
  | "bias"
  | "boll"
  | "atr"
  | "vol"
  | "obv"
  | "hv"
  | "vwap"
  | "vwap_bands"
  | "vp"
  | "mfi"
  | "cmf"
  | "kama"
  | "supertrend"
  | "hma"
  | "alma"
  | "ichimoku"
  | "adx"
  | "keltner"
  | "donchian"
  | "harmonic"
  | "hilbert"
  | "hurst"
  | "garch"
  | "rolling_corr"
  | "tddwave"
  | "kalman"
  | "smc"
  | "chan"
  | "mc"
  | "arima"
  | "hv_ewma";

export type IndicatorGroup = "low" | "mid" | "high";

export type IndicatorPlacement = "overlay" | "pane" | "side";

export type IndicatorMeta = {
  id: IndicatorId;
  label: string;
  group: IndicatorGroup;
  defaultOn?: boolean;
  defaultPlacement: IndicatorPlacement;
};

export const INDICATOR_CATALOG: IndicatorMeta[] = [
  { id: "boll", label: "BOLL", group: "low", defaultOn: true, defaultPlacement: "overlay" },
  { id: "sma", label: "SMA", group: "low", defaultOn: true, defaultPlacement: "overlay" },
  { id: "ema", label: "EMA", group: "low", defaultPlacement: "overlay" },
  { id: "wma", label: "WMA", group: "low", defaultPlacement: "overlay" },
  { id: "macd", label: "MACD", group: "low", defaultPlacement: "pane" },
  { id: "bbi", label: "BBI", group: "low", defaultPlacement: "overlay" },
  { id: "sar", label: "SAR", group: "low", defaultPlacement: "overlay" },
  { id: "rsi", label: "RSI", group: "low", defaultPlacement: "pane" },
  { id: "kdj", label: "KDJ", group: "low", defaultPlacement: "pane" },
  { id: "wr", label: "WR", group: "low", defaultPlacement: "pane" },
  { id: "cci", label: "CCI", group: "low", defaultPlacement: "pane" },
  { id: "bias", label: "BIAS", group: "low", defaultPlacement: "pane" },
  { id: "atr", label: "ATR", group: "low", defaultOn: true, defaultPlacement: "pane" },
  { id: "vol", label: "VOL", group: "low", defaultPlacement: "pane" },
  { id: "obv", label: "OBV", group: "low", defaultPlacement: "pane" },
  { id: "hv", label: "HV", group: "low", defaultOn: true, defaultPlacement: "pane" },
  { id: "vwap", label: "VWAP", group: "mid", defaultPlacement: "overlay" },
  { id: "vwap_bands", label: "VWAP±σ", group: "mid", defaultPlacement: "overlay" },
  { id: "vp", label: "Vol Profile", group: "mid", defaultOn: true, defaultPlacement: "side" },
  { id: "mfi", label: "MFI", group: "mid", defaultPlacement: "pane" },
  { id: "cmf", label: "CMF", group: "mid", defaultPlacement: "pane" },
  { id: "kama", label: "KAMA", group: "mid", defaultPlacement: "overlay" },
  { id: "supertrend", label: "SuperTrend", group: "mid", defaultPlacement: "overlay" },
  { id: "hma", label: "HMA", group: "mid", defaultPlacement: "overlay" },
  { id: "alma", label: "ALMA", group: "mid", defaultPlacement: "overlay" },
  { id: "ichimoku", label: "Ichimoku", group: "mid", defaultPlacement: "overlay" },
  { id: "adx", label: "ADX", group: "mid", defaultPlacement: "pane" },
  { id: "keltner", label: "Keltner", group: "mid", defaultPlacement: "overlay" },
  { id: "donchian", label: "Donchian", group: "mid", defaultPlacement: "overlay" },
  { id: "harmonic", label: "Harmonic", group: "high", defaultPlacement: "overlay" },
  { id: "hilbert", label: "Hilbert", group: "high", defaultPlacement: "pane" },
  { id: "hurst", label: "Hurst", group: "high", defaultPlacement: "pane" },
  { id: "garch", label: "GARCH", group: "high", defaultPlacement: "pane" },
  { id: "rolling_corr", label: "Corr vs SPY", group: "high", defaultPlacement: "pane" },
  { id: "tddwave", label: "TD Wave", group: "high", defaultPlacement: "pane" },
  { id: "kalman", label: "Kalman", group: "high", defaultPlacement: "overlay" },
  { id: "smc", label: "SMC/FVG", group: "high", defaultPlacement: "overlay" },
  { id: "chan", label: "缠论", group: "high", defaultPlacement: "overlay" },
  { id: "mc", label: "MC Channel", group: "high", defaultPlacement: "overlay" },
];

export const DEFAULT_ENABLED: IndicatorId[] = INDICATOR_CATALOG.filter((m) => m.defaultOn).map(
  (m) => m.id,
);

export type SeriesPoint = { time: number; value: number };

export type SeriesOut = {
  id: string;
  pane: "main_price" | "sub" | string;
  values: SeriesPoint[];
  color?: string;
};

export type VolumeProfileOut = {
  id: string;
  price_low: number;
  price_high: number;
  bins: number[];
  poc?: number;
  vah?: number;
  val?: number;
};

export type StructureOut = {
  id: string;
  kind: string;
  label: string;
  points: Array<{ time: number; price: number }>;
  top?: number | null;
  bottom?: number | null;
};

export type CloudSpanOut = {
  id: string;
  start_time: number;
  end_time: number;
  top: number;
  bottom: number;
  bullish: boolean;
};

export type IndicatorResult = {
  series: SeriesOut[];
  profiles: VolumeProfileOut[];
  structures: StructureOut[];
  bands: PredictionOverlay[];
  clouds?: CloudSpanOut[];
  scalars?: Record<string, number | null>;
};

export type IndicatorRequest = {
  bars: OhlcvBar[];
  view?: { fromIdx: number; toIdx: number };
  enabled: IndicatorId[];
  params?: Record<string, unknown>;
  benchmarkCloses?: number[];
};

export type WorkerRequest = {
  type: "compute";
  id: number;
  payload: IndicatorRequest;
};

export type WorkerResponse =
  | { type: "result"; id: number; result: IndicatorResult }
  | { type: "error"; id: number; message: string }
  | { type: "ready" };
