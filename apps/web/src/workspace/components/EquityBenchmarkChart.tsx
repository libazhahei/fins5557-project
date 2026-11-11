import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

export type EquityPoint = { time: number; value: number };

type Series = { id: string; label: string; color: string; data: EquityPoint[] };

type Props = {
  series: Series[];
  height?: number;
};

function seriesSignature(series: Series[]): string {
  return series
    .map((s) => `${s.id}:${s.color}:${s.data.length}:${s.data[0]?.time ?? 0}:${s.data.at(-1)?.value ?? 0}`)
    .join("|");
}

export function EquityBenchmarkChart({ series, height = 140 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const linesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const sigRef = useRef("");

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
      linesRef.current.clear();
      sigRef.current = "";
    };
  }, [height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const sig = seriesSignature(series);
    if (sig === sigRef.current) return;
    sigRef.current = sig;

    const keep = new Set(series.map((s) => s.id));
    for (const [id, line] of linesRef.current) {
      if (!keep.has(id)) {
        chart.removeSeries(line);
        linesRef.current.delete(id);
      }
    }
    for (const s of series) {
      let line = linesRef.current.get(s.id);
      if (!line) {
        line = chart.addSeries(LineSeries, {
          color: s.color,
          lineWidth: 2,
          title: s.label,
        });
        linesRef.current.set(s.id, line);
      } else {
        line.applyOptions({ color: s.color, title: s.label });
      }
      line.setData(s.data.map((p) => ({ time: p.time as Time, value: p.value })));
    }
    chart.timeScale().fitContent();
  }, [series]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
