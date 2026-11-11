import { useEffect, useMemo, useRef, useState } from "react";
import {
  dispose,
  init,
  registerIndicator,
  IndicatorSeries,
  LineType,
  type KLineData,
} from "klinecharts";
import { api } from "../../api";
import type { IndicatorResult, SeriesOut, StructureOut } from "../../wasm/types";
import {
  isChartPredOverlay,
  projectOverlays,
  projectTradeMarkers,
  timestampToUnix,
  type OverlayGeometry,
} from "../lib/predictionOverlayRender";
import { groupSeriesIntoPanes } from "../lib/seriesPaneGroups";
import type { ChartTradeLogMarker, PredictionOverlay } from "../types";
import { VolumeProfilePane } from "./VolumeProfilePane";

type ChartApi = {
  applyNewData: (data: KLineData[], more?: boolean, callback?: () => void) => void;
  createIndicator: (
    value: string | Record<string, unknown>,
    isStack?: boolean,
    paneOptions?: Record<string, unknown>,
    callback?: () => void,
  ) => string | null;
  removeIndicator: (paneId: string, name?: string) => void;
  createOverlay: (...args: unknown[]) => unknown;
  getOverlays?: () => unknown[];
  setPaneOptions?: (options: Record<string, unknown>) => void;
  resize?: () => void;
  getVisibleRange?: () => { from: number; to: number; realFrom?: number; realTo?: number };
  subscribeAction?: (type: string, cb: (...args: unknown[]) => void) => void;
  unsubscribeAction?: (type: string, cb?: (...args: unknown[]) => void) => void;
  convertToPixel?: (
    data: { timestamp?: number; dataIndex?: number; value?: number },
    paneId?: string,
  ) => { x: number; y: number } | null;
  scrollToTimestamp?: (timestamp: number, animationDuration?: number) => void;
  scrollToDataIndex?: (index: number, animationDuration?: number) => void;
  executeAction?: (type: string, data?: unknown) => void;
  getDataList?: () => KLineData[];
};

/** Sub-pane height that keeps candle + all subs inside the host. */
function fitSubPaneHeight(hostH: number, subCount: number): number {
  if (subCount <= 0) return 56;
  const xAxis = 28;
  const mainReserve = Math.max(110, Math.floor(hostH * 0.42));
  const available = Math.max(0, hostH - mainReserve - xAxis);
  return Math.max(32, Math.min(72, Math.floor(available / subCount)));
}

export type CandleBar = {
  time: number;
  timestamp?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type Props = {
  symbol: string;
  bars: CandleBar[];
  tradeLogs?: ChartTradeLogMarker[];
  predictions?: PredictionOverlay[];
  showTradeLogs?: boolean;
  showPredictions?: boolean;
  selectedLogId?: string | null;
  onSelectLog?: (id: string) => void;
  drawingTool?: string | null;
  indicatorResult?: IndicatorResult | null;
  showLegend?: boolean;
  showVolumeProfile?: boolean;
  /** Where to dock VP when shown: side strip or sub-pane under the chart. */
  volumeProfileLayout?: "side" | "pane";
  onVisibleRangeChange?: (range: { from: number; to: number }) => void;
};

const MAIN_COLORS: Record<string, string> = {
  sma20: "#2563eb",
  ema20: "#7c3aed",
  wma20: "#0891b2",
  boll_upper: "#94a3b8",
  boll_mid: "#64748b",
  boll_lower: "#94a3b8",
  kalman: "#ea580c",
  vwap: "#0d9488",
  vwap_u: "#14b8a6",
  vwap_m: "#0f766e",
  vwap_l: "#14b8a6",
  supertrend: "#dc2626",
  kama: "#ca8a04",
  hma: "#db2777",
  alma: "#4f46e5",
  sar: "#f59e0b",
  bbi: "#6366f1",
  ichi_tenkan: "#ef4444",
  ichi_kijun: "#3b82f6",
  kelt_u: "#a855f7",
  kelt_m: "#7c3aed",
  kelt_l: "#a855f7",
  don_u: "#64748b",
  don_m: "#475569",
  don_l: "#64748b",
  atr14: "#0f766e",
  hv20: "#b45309",
  rsi14: "#7c3aed",
  macd: "#2563eb",
  macd_signal: "#ea580c",
  macd_hist: "#64748b",
  vol: "#71717a",
  obv: "#0891b2",
  mfi: "#db2777",
  cmf: "#4f46e5",
  adx: "#dc2626",
  plus_di: "#16a34a",
  minus_di: "#e11d48",
  kdj_k: "#2563eb",
  kdj_d: "#ea580c",
  wr: "#0891b2",
  cci: "#7c3aed",
  bias: "#ca8a04",
  hilbert: "#6366f1",
  hurst: "#a855f7",
  garch: "#f59e0b",
  corr_spy: "#0d9488",
  tddwave: "#64748b",
};

const registeredNames = new Set<string>();

type ValueMap = Record<number, number>;

function toValueMap(
  seriesId: string,
  series: IndicatorResult["series"],
): ValueMap {
  const s = series.find((x) => x.id === seriesId);
  const m: ValueMap = {};
  if (!s) return m;
  for (const p of s.values) {
    if (!Number.isFinite(p.value)) continue;
    const ts = p.time > 1e12 ? p.time : p.time * 1000;
    m[ts] = p.value;
  }
  return m;
}

function lineStyles(color: string) {
  return {
    lines: [
      {
        style: LineType.Solid,
        size: 1.25,
        color,
        dashedValue: [2, 2],
        smooth: false,
      },
    ],
  };
}

function ensureSeriesIndicator(seriesId: string, pane: "main" | "sub") {
  const name = pane === "main" ? `QLM_${seriesId}` : `QLS_${seriesId}`;
  if (registeredNames.has(name)) return name;
  registeredNames.add(name);
  registerIndicator({
    name,
    shortName: seriesId.slice(0, 10),
    series: pane === "main" ? IndicatorSeries.Price : IndicatorSeries.Normal,
    precision: pane === "main" ? 2 : 4,
    figures: [{ key: "ql", title: `${seriesId}: `, type: "line" }],
    calc: (dataList: KLineData[], indicator: { extendData?: ValueMap }) => {
      const map = indicator.extendData || {};
      return dataList.map((d) => {
        const v = map[d.timestamp];
        return v == null || !Number.isFinite(v) ? {} : { ql: v };
      });
    },
  });
  return name;
}

function toKline(bars: CandleBar[]): KLineData[] {
  return bars.map((b) => ({
    timestamp: b.time * 1000,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? 0,
  }));
}

export function KlineChartCanvas({
  symbol,
  bars,
  tradeLogs = [],
  predictions = [],
  showTradeLogs = true,
  showPredictions = true,
  selectedLogId,
  onSelectLog,
  drawingTool,
  indicatorResult,
  showLegend = false,
  showVolumeProfile = true,
  volumeProfileLayout = "side",
  onVisibleRangeChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const saveTimer = useRef<number | null>(null);
  const paneIdsRef = useRef<string[]>([]);
  const volPaneIdRef = useRef<string | null>(null);
  const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
  const [status, setStatus] = useState("");
  const [overlayGeoms, setOverlayGeoms] = useState<OverlayGeometry[]>([]);
  const [markerPixels, setMarkerPixels] = useState<
    Array<{ id: string; x: number; y: number; action: string; label: string; log: ChartTradeLogMarker }>
  >([]);
  const [overlayTick, setOverlayTick] = useState(0);

  useEffect(() => {
    onVisibleRangeChangeRef.current = onVisibleRangeChange;
  }, [onVisibleRangeChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const chart = init(host) as unknown as ChartApi;
    chartRef.current = chart;
    // Default Y-axis is flex (autoCalc). scrollZoomEnabled lets drag switch to fixed;
    // double-click the Y-axis returns to flex (klinecharts built-in).
    chart.setPaneOptions?.({
      id: "candle_pane",
      axisOptions: { scrollZoomEnabled: true },
    });
    const emitVisible = () => {
      const range = chart.getVisibleRange?.();
      if (!range) return;
      onVisibleRangeChangeRef.current?.({ from: range.from, to: range.to });
      setOverlayTick((n) => n + 1);
    };
    chart.subscribeAction?.("onVisibleRangeChange", emitVisible);
    chart.subscribeAction?.("onScroll", emitVisible);
    chart.subscribeAction?.("onZoom", emitVisible);
    const ro = new ResizeObserver(() => {
      chart.resize?.();
      setOverlayTick((n) => n + 1);
    });
    ro.observe(host);
    return () => {
      chart.unsubscribeAction?.("onVisibleRangeChange", emitVisible);
      chart.unsubscribeAction?.("onScroll", emitVisible);
      chart.unsubscribeAction?.("onZoom", emitVisible);
      ro.disconnect();
      dispose(host);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length) return;
    chart.applyNewData(toKline(bars));
    // After data loads, report the current visible window for VP.
    window.setTimeout(() => {
      const range = chart.getVisibleRange?.();
      if (range) onVisibleRangeChangeRef.current?.({ from: range.from, to: range.to });
    }, 0);
  }, [bars, symbol]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !drawingTool) return;
    try {
      chart.createOverlay({ name: drawingTool as "trendLine" });
    } catch {
      /* ignore */
    }
  }, [drawingTool]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const persist = () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        try {
          const overlays = chart.getOverlays?.() ?? [];
          void api(`/market/drawings/${symbol}`, {
            method: "PUT",
            body: JSON.stringify({ overlays }),
          });
        } catch {
          /* ignore */
        }
      }, 600);
    };
    chart.subscribeAction?.("onDrawEnd", persist);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [symbol]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    void api<{ overlays: unknown[] }>(`/market/drawings/${symbol}`)
      .then((res) => {
        for (const ov of res.overlays || []) {
          try {
            chart.createOverlay(ov as never);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => undefined);
  }, [symbol]);

  const chartPredictions = useMemo(() => {
    const apiPreds = (predictions || []).filter(isChartPredOverlay);
    const wasmPreds = ((indicatorResult?.bands || []) as PredictionOverlay[]).filter(
      isChartPredOverlay,
    );
    if (!showPredictions) return [] as PredictionOverlay[];
    // Prefer backend M8 over wasm HV when both present on vol pane
    const hasM8Vol = apiPreds.some(
      (p) => p.target_pane === "sub_volatility" && p.model_source?.includes("M8"),
    );
    const wasmFiltered = hasM8Vol
      ? wasmPreds.filter((p) => p.target_pane !== "sub_volatility")
      : wasmPreds;
    return [...apiPreds, ...wasmFiltered];
  }, [predictions, indicatorResult?.bands, showPredictions]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length) return;

    const series: SeriesOut[] = [...(indicatorResult?.series || [])];
    volPaneIdRef.current = null;

    // Always ensure a dedicated volatility Pred pane so convertToPixel has a Y scale
    const needVolPane = chartPredictions.some((p) => p.target_pane === "sub_volatility");
    if (needVolPane && !series.some((s) => s.id === "pred_vol")) {
      const line = chartPredictions.find(
        (p) => p.target_pane === "sub_volatility" && (p.line_series?.length || p.band_series?.length),
      );
      const values: SeriesOut["values"] = [];
      if (line?.line_series?.length) {
        for (const pt of line.line_series) {
          const unix = timestampToUnix(pt.timestamp);
          if (unix == null) continue;
          values.push({ time: unix, value: pt.value });
        }
      } else if (line?.band_series?.length) {
        for (const pt of line.band_series) {
          const unix = timestampToUnix(pt.timestamp);
          if (unix == null || pt.mid == null) continue;
          values.push({ time: unix, value: pt.mid });
        }
      }
      if (values.length) {
        series.push({ id: "pred_vol", pane: "sub_volatility", values });
      }
    }

    for (const key of paneIdsRef.current) {
      try {
        if (key.startsWith("candle_pane:")) {
          chart.removeIndicator("candle_pane", key.slice("candle_pane:".length));
        } else {
          chart.removeIndicator(key);
        }
      } catch {
        /* ignore */
      }
    }
    paneIdsRef.current = [];

    chart.applyNewData(toKline(bars));

    const groups = groupSeriesIntoPanes(series);
    const subCount = groups.filter((g) => !g.isMain).length;
    const hostH = hostRef.current?.clientHeight || 360;
    const subHeight = fitSubPaneHeight(hostH, subCount);
    const subMinHeight = Math.min(40, subHeight);

    let created = 0;
    for (const g of groups) {
      if (g.isMain) {
        for (const s of g.series) {
          const extendData = toValueMap(s.id, series);
          if (!Object.keys(extendData).length) continue;
          const color = MAIN_COLORS[s.id] || "#2563eb";
          try {
            const name = ensureSeriesIndicator(s.id, "main");
            chart.createIndicator(
              {
                name,
                shortName: s.id,
                extendData,
                styles: lineStyles(color),
              },
              true,
              { id: "candle_pane", axisOptions: { scrollZoomEnabled: true } },
            );
            paneIdsRef.current.push(`candle_pane:${name}`);
            created += 1;
          } catch (err) {
            console.warn("createIndicator failed", s.id, err);
          }
        }
        continue;
      }

      const paneId = `ql_${g.key.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const isVolPane =
        g.key.includes("pred_vol") ||
        g.series.some((s) => s.pane === "sub_volatility" || s.id === "pred_vol" || s.id.startsWith("hv"));
      g.series.forEach((s, idx) => {
        const extendData = toValueMap(s.id, series);
        if (!Object.keys(extendData).length) return;
        const color = MAIN_COLORS[s.id] || (s.id === "pred_vol" ? "#b45309" : "#71717a");
        try {
          const name = ensureSeriesIndicator(s.id, "sub");
          chart.createIndicator(
            {
              name,
              shortName: s.id,
              extendData,
              styles: lineStyles(color),
            },
            idx > 0, // stack additional series into same pane
            {
              id: paneId,
              height: subHeight,
              minHeight: subMinHeight,
              axisOptions: { scrollZoomEnabled: true },
            },
          );
          if (idx === 0) {
            paneIdsRef.current.push(paneId);
            if (isVolPane) volPaneIdRef.current = paneId;
          }
          created += 1;
        } catch (err) {
          console.warn("createIndicator failed", s.id, err);
        }
      });
    }

    // Keep candle pane Y flex by default; do not force fixed range.
    chart.setPaneOptions?.({
      id: "candle_pane",
      axisOptions: { scrollZoomEnabled: true },
    });
    for (const paneId of paneIdsRef.current) {
      if (paneId.startsWith("candle_pane:")) continue;
      chart.setPaneOptions?.({
        id: paneId,
        height: subHeight,
        minHeight: subMinHeight,
        axisOptions: { scrollZoomEnabled: true },
      });
    }

    window.setTimeout(() => {
      chart.resize?.();
      chart.applyNewData(toKline(bars));
      setOverlayTick((n) => n + 1);
    }, 0);
    const predN = chartPredictions.length;
    setStatus(
      series.length
        ? `WASM ${series.length} series · ${created} drawn · ${subCount} panes · h${subHeight} · Pred ${predN}`
        : `WASM 0 series · Pred ${predN}`,
    );
  }, [indicatorResult, bars, chartPredictions]);

  // Project Pred + trade markers into SVG pixels
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length || !chart.convertToPixel) {
      setOverlayGeoms([]);
      setMarkerPixels([]);
      return;
    }
    const convert = (
      data: { timestamp?: number; dataIndex?: number; value?: number },
      paneId?: string,
    ) => chart.convertToPixel?.(data, paneId || "candle_pane") ?? null;

    const geoms = projectOverlays({
      overlays: chartPredictions,
      bars,
      convert,
      mainPaneId: "candle_pane",
      volPaneId: volPaneIdRef.current,
      hostWidth: hostRef.current?.clientWidth || 800,
      hostHeight: hostRef.current?.clientHeight || 400,
    });
    setOverlayGeoms(geoms);

    if (showTradeLogs) {
      setMarkerPixels(
        projectTradeMarkers({
          logs: tradeLogs,
          symbol,
          bars,
          convert,
          mainPaneId: "candle_pane",
        }),
      );
    } else {
      setMarkerPixels([]);
    }
  }, [
    bars,
    chartPredictions,
    tradeLogs,
    showTradeLogs,
    symbol,
    overlayTick,
    indicatorResult,
  ]);

  // Table → chart: scroll + crosshair when selectedLogId changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !selectedLogId || !bars.length) return;
    const log = tradeLogs.find((l) => l.id === selectedLogId);
    if (!log) return;
    const unix = timestampToUnix(log.timestamp);
    if (unix == null) return;
    try {
      chart.scrollToTimestamp?.(unix * 1000, 200);
    } catch {
      const idx = bars.findIndex((b) => {
        const t = b.time > 1e12 ? Math.floor(b.time / 1000) : b.time;
        return Math.abs(t - unix) < 86400;
      });
      if (idx >= 0) chart.scrollToDataIndex?.(idx, 200);
    }
    setOverlayTick((n) => n + 1);
  }, [selectedLogId, tradeLogs, bars]);

  const structures: StructureOut[] = indicatorResult?.structures || [];

  const lastBar = bars.length ? bars[bars.length - 1] : null;
  const overlayLegend = (indicatorResult?.series || [])
    .filter((s) => s.pane === "main_price")
    .slice(0, 6)
    .map((s) => {
      const pt = [...s.values].reverse().find((v) => Number.isFinite(v.value));
      return pt ? { id: s.id, value: pt.value } : null;
    })
    .filter(Boolean) as { id: string; value: number }[];

  const vp = showVolumeProfile ? indicatorResult?.profiles?.[0] : null;
  const vpSide = Boolean(vp) && volumeProfileLayout === "side";
  const vpPane = Boolean(vp) && volumeProfileLayout === "pane";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="relative h-full min-h-0 min-w-0 flex-1">
        <div ref={hostRef} className="h-full min-h-0 w-full" data-testid="kline-canvas" />
        {showLegend && lastBar && (
          <div className="pointer-events-none absolute left-1 top-1 z-10 max-w-[90%] rounded bg-white/85 px-1.5 py-0.5 text-[9px] text-zinc-800 shadow-sm">
            <span className="font-semibold">{symbol}</span>{" "}
            <span className="text-zinc-500">
              O {lastBar.open.toFixed(2)} H {lastBar.high.toFixed(2)} L {lastBar.low.toFixed(2)} C{" "}
              {lastBar.close.toFixed(2)}
            </span>
            {overlayLegend.length > 0 && (
              <span className="ml-1 text-zinc-600">
                {overlayLegend.map((x) => `${x.id} ${x.value.toFixed(2)}`).join(" · ")}
              </span>
            )}
          </div>
        )}
        {status && (
          <div className="pointer-events-none absolute bottom-1 left-1 z-10 rounded bg-zinc-900/60 px-1 text-[8px] text-white">
            {status}
          </div>
        )}
        <svg
          className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
          aria-hidden
        >
          {overlayGeoms.flatMap((g) =>
            (g.regimeRects || []).map((r, i) => (
              <rect
                key={`${g.id}-r-${i}`}
                x={r.x}
                y={0}
                width={r.width}
                height="100%"
                fill={r.tone}
              />
            )),
          )}
          {overlayGeoms.map((g) =>
            g.bandPath ? (
              <path
                key={`${g.id}-band`}
                d={g.bandPath}
                fill={g.color}
                fillOpacity={g.fillOpacity}
                stroke="none"
              />
            ) : null,
          )}
          {overlayGeoms.map((g) =>
            g.midPath ? (
              <path
                key={`${g.id}-mid`}
                d={g.midPath}
                fill="none"
                stroke={g.color}
                strokeWidth={1.25}
                strokeDasharray="4 3"
              />
            ) : null,
          )}
          {overlayGeoms.map((g) =>
            g.linePath ? (
              <path
                key={`${g.id}-line`}
                d={g.linePath}
                fill="none"
                stroke={g.color}
                strokeWidth={1.5}
              />
            ) : null,
          )}
        </svg>
        {markerPixels.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow ${
              selectedLogId === m.id
                ? "bg-blue-600 text-white ring-2 ring-blue-300"
                : m.action === "SELL"
                  ? "bg-red-500 text-white"
                  : "bg-emerald-600 text-white"
            }`}
            style={{ left: m.x, top: m.y }}
            title={`${m.log.timestamp} ${m.log.action}: ${m.log.reason_detail}`}
            onClick={() => onSelectLog?.(m.id)}
          >
            {m.label}
          </button>
        ))}
        {showPredictions && overlayGeoms.length > 0 && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 max-w-[45%] rounded bg-white/90 px-1.5 py-0.5 text-[9px] text-zinc-700 shadow-sm">
            <span className="font-semibold">Pred</span>{" "}
            <span className="text-zinc-500">research sketch</span>
            {" · "}
            {overlayGeoms
              .slice(0, 3)
              .map((g) => g.name.replace(/\s*\(.*/, ""))
              .join(" · ")}
          </div>
        )}
        {structures.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-wrap gap-1 px-1">
            {structures.slice(-10).map((s) => (
              <span
                key={s.id}
                className="rounded bg-zinc-900/70 px-1 py-0.5 text-[8px] text-white"
                title={s.kind}
              >
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {vpSide && <VolumeProfilePane profile={vp} layout="side" />}
      </div>
      {vpPane && <VolumeProfilePane profile={vp} layout="pane" />}
    </div>
  );
}
