import type { SeriesOut } from "./types";

/** timestamp(ms) -> value, keyed by series id */
const store = new Map<string, Map<number, number>>();

export function setWasmSeries(series: SeriesOut[]): void {
  store.clear();
  for (const s of series) {
    const m = new Map<number, number>();
    for (const p of s.values) {
      if (!Number.isFinite(p.value)) continue;
      // bars.time is unix seconds; klinecharts uses ms
      const ts = p.time > 1e12 ? p.time : p.time * 1000;
      m.set(ts, p.value);
    }
    store.set(s.id, m);
  }
}

export function getWasmValue(seriesId: string, timestampMs: number): number | null {
  const v = store.get(seriesId)?.get(timestampMs);
  return v == null || !Number.isFinite(v) ? null : v;
}
