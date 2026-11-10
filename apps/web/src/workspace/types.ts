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
  symbols: ["SPY", "TLT", "GLD"],
  startDate: "2018-01-01",
  endDate: "2025-12-31",
  targetVol: 10,
  maWindow: 200,
  rebalance: "Monthly",
  costBps: 10,
  benchmark: "SPY Buy & Hold",
  enableMc: false,
  enableRv: false,
};
