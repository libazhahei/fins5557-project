import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";

export type EquityPoint = { time: number; value: number };

type Series = { id: string; label: string; color: string; data: EquityPoint[] };

type Props = {
  series: Series[];
  height?: number;
};

export function EquityBenchmarkChart({ series, height = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height,
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
    });
    chartRef.current = chart;
    for (const s of series) {
      const line = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: 2,
        title: s.label,
      });
      line.setData(s.data.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    chart.timeScale().fitContent();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && ref.current) {
      ro = new ResizeObserver(() => {
        if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
      });
      ro.observe(ref.current);
    }
    return () => {
      ro?.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [series, height]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
