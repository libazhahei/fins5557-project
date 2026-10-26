import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type EquityPoint = { time: number; value: number };

type Props = {
  candles: Candle[];
  equity?: EquityPoint[];
  symbol: string;
};

export function ChartPanel({ candles, equity, symbol }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "#f7f4ec" },
        textColor: "#1a1c18",
      },
      grid: {
        vertLines: { color: "#e0d8c8" },
        horzLines: { color: "#e0d8c8" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    chartRef.current = chart;

    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: "#0f6b5c",
      downColor: "#9b2c2c",
      borderVisible: false,
      wickUpColor: "#0f6b5c",
      wickDownColor: "#9b2c2c",
    });
    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as unknown as import("lightweight-charts").UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    if (equity && equity.length) {
      const line: ISeriesApi<"Line"> = chart.addSeries(LineSeries, {
        color: "#2c5282",
        lineWidth: 2,
        priceScaleId: "equity",
      });
      chart.priceScale("equity").applyOptions({
        scaleMargins: { top: 0.7, bottom: 0 },
      });
      line.setData(
        equity.map((p) => ({
          time: p.time as unknown as import("lightweight-charts").UTCTimestamp,
          value: p.value,
        })),
      );
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, equity, symbol]);

  return (
    <div>
      <div className="chart-label">{symbol} · K2</div>
      <div ref={ref} className="chart-host" data-testid="chart-host" />
    </div>
  );
}
