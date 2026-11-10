import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type EquityPoint = { time: number; value: number };

export type ChartMarker = {
  time: number;
  position?: "belowBar" | "aboveBar";
  color?: string;
  shape?: "arrowUp" | "arrowDown" | "circle";
  text?: string;
};

type Props = {
  candles: Candle[];
  equity?: EquityPoint[];
  benchmark?: EquityPoint[];
  markers?: ChartMarker[];
  symbol: string;
  showMarkers?: boolean;
  candleHeight?: number;
  equityHeight?: number;
};

export function ChartPanel({
  candles,
  equity,
  benchmark,
  markers = [],
  symbol,
  showMarkers = true,
  candleHeight = 220,
  equityHeight = 140,
}: Props) {
  const candleRef = useRef<HTMLDivElement>(null);
  const equityRef = useRef<HTMLDivElement>(null);
  const candleChart = useRef<IChartApi | null>(null);
  const equityChart = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!candleRef.current || !equityRef.current) return;

    const shared = {
      layout: {
        background: { type: ColorType.Solid, color: "#fafafa" },
        textColor: "#3f3f46",
        fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#e4e4e7" },
        horzLines: { color: "#e4e4e7" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    };

    const cChart = createChart(candleRef.current, { ...shared, height: candleHeight });
    const eChart = createChart(equityRef.current, { ...shared, height: equityHeight });
    candleChart.current = cChart;
    equityChart.current = eChart;

    const candleSeries: ISeriesApi<"Candlestick"> = cChart.addSeries(CandlestickSeries, {
      upColor: "#059669",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#059669",
      wickDownColor: "#dc2626",
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    if (showMarkers && markers.length) {
      const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => ({
        time: m.time as Time,
        position: m.position ?? (m.shape === "arrowDown" ? "aboveBar" : "belowBar"),
        color: m.color ?? (m.shape === "arrowDown" ? "#dc2626" : "#059669"),
        shape: m.shape ?? "arrowUp",
        text: m.text,
      }));
      createSeriesMarkers(candleSeries, seriesMarkers);
    }

    if (equity?.length) {
      const strat: ISeriesApi<"Line"> = eChart.addSeries(LineSeries, {
        color: "#059669",
        lineWidth: 2,
        title: "Strategy",
      });
      strat.setData(equity.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    if (benchmark?.length) {
      const bench: ISeriesApi<"Line"> = eChart.addSeries(LineSeries, {
        color: "#a1a1aa",
        lineWidth: 1,
        lineStyle: 2,
        title: "SPY",
      });
      bench.setData(benchmark.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    const syncing = { lock: false };
    const sync = (source: IChartApi, target: IChartApi) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing.lock || !range) return;
        syncing.lock = true;
        target.timeScale().setVisibleLogicalRange(range);
        syncing.lock = false;
      });
    };
    sync(cChart, eChart);
    sync(eChart, cChart);

    cChart.timeScale().fitContent();
    eChart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (candleRef.current) cChart.applyOptions({ width: candleRef.current.clientWidth });
      if (equityRef.current) eChart.applyOptions({ width: equityRef.current.clientWidth });
    });
    ro.observe(candleRef.current);
    ro.observe(equityRef.current);

    return () => {
      ro.disconnect();
      cChart.remove();
      eChart.remove();
      candleChart.current = null;
      equityChart.current = null;
    };
  }, [candles, equity, benchmark, markers, symbol, showMarkers, candleHeight, equityHeight]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="text-[10px] text-zinc-500">{symbol}</div>
      <div ref={candleRef} className="chart-host" data-testid="chart-candles" />
      <div className="text-[10px] text-zinc-500">Equity vs SPY</div>
      <div ref={equityRef} className="chart-host" data-testid="chart-equity" />
    </div>
  );
}
