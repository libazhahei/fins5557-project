import type {
  IndicatorId,
  IndicatorRequest,
  IndicatorResult,
  OhlcvBar,
  SeriesOut,
  StructureOut,
  VolumeProfileOut,
} from "./types";

type WickraMod = typeof import("wickra-wasm");

function f64(arr: number[]): Float64Array {
  return Float64Array.from(arr);
}

function seriesFrom(
  id: string,
  bars: OhlcvBar[],
  values: ArrayLike<number>,
  pane = "main_price",
  stride = 1,
  offset = 0,
): SeriesOut {
  const out: SeriesOut = { id, pane, values: [] };
  const n = bars.length;
  for (let i = 0; i < n; i++) {
    const v = Number(values[i * stride + offset]);
    if (Number.isFinite(v)) out.values.push({ time: bars[i].time, value: v });
  }
  return out;
}

function lastFinite(values: ArrayLike<number>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = Number(values[i]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function hvPercentile(hvSeries: number[], window = 252): number | null {
  const last = lastFinite(hvSeries);
  if (last == null) return null;
  const tail = hvSeries.filter((v) => Number.isFinite(v)).slice(-window);
  if (tail.length < 10) return null;
  const ranked = [...tail].sort((a, b) => a - b);
  let below = 0;
  for (const v of ranked) if (v <= last) below++;
  return below / ranked.length;
}

function detectHarmonic(W: WickraMod, bars: OhlcvBar[]): StructureOut[] {
  const patterns: Array<{
    name: string;
    Cls: new () => {
      update: (o: number, h: number, l: number, c: number) => number | undefined;
    };
  }> = [
    { name: "Gartley", Cls: W.Gartley as never },
    { name: "Bat", Cls: W.Bat as never },
    { name: "Butterfly", Cls: W.Butterfly as never },
    { name: "Crab", Cls: W.Crab as never },
  ];
  const out: StructureOut[] = [];
  for (const p of patterns) {
    try {
      const ind = new p.Cls();
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        const sig = ind.update(b.open, b.high, b.low, b.close);
        if (sig && sig !== 0) {
          out.push({
            id: `harm-${p.name}-${i}`,
            kind: "harmonic",
            label: `${p.name}${sig > 0 ? "+" : "-"}`,
            points: [{ time: b.time, price: b.close }],
          });
        }
      }
    } catch {
      /* skip unavailable pattern */
    }
  }
  return out.slice(-12);
}

export function computeWickra(W: WickraMod, req: IndicatorRequest): IndicatorResult {
  const bars = req.bars;
  const enabled = new Set(req.enabled);
  const result: IndicatorResult = {
    series: [],
    profiles: [],
    structures: [],
    bands: [],
    clouds: [],
    scalars: {},
  };
  if (!bars.length) return result;

  // Sanitize OHLC: fixtures / bad ticks can have close outside [low, high]
  const highArr = new Float64Array(bars.length);
  const lowArr = new Float64Array(bars.length);
  const closeArr = new Float64Array(bars.length);
  const volume = f64(bars.map((b) => b.volume ?? 0));
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    let hi = b.high;
    let lo = b.low;
    if (!(hi >= lo)) {
      hi = Math.max(b.open, b.close, b.high, b.low);
      lo = Math.min(b.open, b.close, b.high, b.low);
    }
    highArr[i] = hi;
    lowArr[i] = lo;
    closeArr[i] = Math.min(hi, Math.max(lo, b.close));
  }
  const close = closeArr;
  const high = highArr;
  const low = lowArr;

  const has = (id: IndicatorId) => enabled.has(id);
  const safe = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.warn(`[wickra] ${label} failed`, err);
    }
  };

  safe("sma", () => {
    if (!has("sma")) return;
    const v = new W.SMA(20).batch(close);
    result.series.push(seriesFrom("sma20", bars, v));
  });
  safe("ema", () => {
    if (!has("ema")) return;
    const v = new W.EMA(20).batch(close);
    result.series.push(seriesFrom("ema20", bars, v));
  });
  safe("wma", () => {
    if (!has("wma")) return;
    const v = new W.WMA(20).batch(close);
    result.series.push(seriesFrom("wma20", bars, v));
  });
  safe("bbi", () => {
    if (!has("bbi")) return;
    const a = new W.SMA(3).batch(close);
    const b = new W.SMA(6).batch(close);
    const c = new W.SMA(12).batch(close);
    const d = new W.SMA(24).batch(close);
    const vals = new Float64Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      const xs = [a[i], b[i], c[i], d[i]].filter((x) => Number.isFinite(x));
      vals[i] = xs.length === 4 ? (xs[0] + xs[1] + xs[2] + xs[3]) / 4 : Number.NaN;
    }
    result.series.push(seriesFrom("bbi", bars, vals));
  });
  safe("macd", () => {
    if (!has("macd")) return;
    const v = new W.MACD(12, 26, 9).batch(close);
    result.series.push(seriesFrom("macd", bars, v, "sub", 3, 0));
    result.series.push(seriesFrom("macd_signal", bars, v, "sub", 3, 1));
    result.series.push(seriesFrom("macd_hist", bars, v, "sub", 3, 2));
  });
  safe("sar", () => {
    if (!has("sar")) return;
    const v = new W.PSAR(0.02, 0.02, 0.2).batch(high, low, close);
    result.series.push(seriesFrom("sar", bars, v));
  });
  safe("rsi", () => {
    if (!has("rsi")) return;
    result.series.push(seriesFrom("rsi14", bars, new W.RSI(14).batch(close), "sub"));
  });
  safe("kdj", () => {
    if (!has("kdj")) return;
    const v = new W.Stochastic(14, 3).batch(high, low, close);
    result.series.push(seriesFrom("kdj_k", bars, v, "sub", 2, 0));
    result.series.push(seriesFrom("kdj_d", bars, v, "sub", 2, 1));
  });
  safe("wr", () => {
    if (!has("wr")) return;
    result.series.push(seriesFrom("wr", bars, new W.WilliamsR(14).batch(high, low, close), "sub"));
  });
  safe("cci", () => {
    if (!has("cci")) return;
    result.series.push(seriesFrom("cci", bars, new W.CCI(14).batch(high, low, close), "sub"));
  });
  safe("bias", () => {
    if (!has("bias")) return;
    const sma = new W.SMA(20).batch(close);
    const vals = new Float64Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      vals[i] = Number.isFinite(sma[i]) && sma[i] !== 0 ? ((close[i] - sma[i]) / sma[i]) * 100 : Number.NaN;
    }
    result.series.push(seriesFrom("bias", bars, vals, "sub"));
  });
  safe("boll", () => {
    if (!has("boll")) return;
    const v = new W.BollingerBands(20, 2).batch(close);
    result.series.push(seriesFrom("boll_upper", bars, v, "main_price", 4, 0));
    result.series.push(seriesFrom("boll_mid", bars, v, "main_price", 4, 1));
    result.series.push(seriesFrom("boll_lower", bars, v, "main_price", 4, 2));
  });
  safe("atr", () => {
    if (!has("atr")) return;
    const v = new W.ATR(14).batch(high, low, close);
    result.series.push(seriesFrom("atr14", bars, v, "sub"));
    result.scalars!.atr_14 = lastFinite(v);
  });
  safe("vol", () => {
    if (!has("vol")) return;
    result.series.push(
      seriesFrom(
        "vol",
        bars,
        bars.map((b) => b.volume ?? 0),
        "sub",
      ),
    );
  });
  safe("obv", () => {
    if (!has("obv")) return;
    result.series.push(seriesFrom("obv", bars, new W.OBV().batch(close, volume), "sub"));
  });
  safe("hv", () => {
    if (!has("hv")) return;
    const v = new W.HistoricalVolatility(20, 252).batch(close);
    result.series.push(seriesFrom("hv20", bars, v, "sub"));
    result.scalars!.hv_20 = lastFinite(v);
    result.scalars!.hv_percentile = hvPercentile(Array.from(v));
  });
  safe("vwap", () => {
    if (!has("vwap")) return;
    result.series.push(seriesFrom("vwap", bars, new W.VWAP().batch(high, low, close, volume)));
  });
  safe("vwap_bands", () => {
    if (!has("vwap_bands")) return;
    const v = new W.VwapStdDevBands(1).batch(high, low, close, volume);
    result.series.push(seriesFrom("vwap_u", bars, v, "main_price", 4, 0));
    result.series.push(seriesFrom("vwap_m", bars, v, "main_price", 4, 1));
    result.series.push(seriesFrom("vwap_l", bars, v, "main_price", 4, 2));
  });
  safe("vp", () => {
    if (!has("vp")) return;
    const from = req.view?.fromIdx ?? Math.max(0, bars.length - 60);
    const to = req.view?.toIdx ?? bars.length - 1;
    const slice = bars.slice(from, to + 1);
    if (slice.length < 5) return;
    const period = slice.length;
    const bins = 48;
    const vp = new W.VolumeProfile(period, bins);
    let last: { priceLow: number; priceHigh: number; bins: number[] | Float64Array | number } | undefined;
    for (const b of slice) {
      const u = vp.update(b.high, b.low, b.volume ?? 0) as typeof last;
      if (u) last = u;
    }
    const va = new W.ValueArea(period, bins, 0.7);
    let levels: { poc: number; vah: number; val: number } | undefined;
    for (const b of slice) {
      const u = va.update(b.high, b.low, b.volume ?? 0) as typeof levels;
      if (u) levels = u;
    }
    if (!last) return;
    const binArr = Array.isArray(last.bins)
      ? last.bins
      : typeof last.bins === "number"
        ? []
        : Array.from(last.bins as Float64Array);
    const profile: VolumeProfileOut = {
      id: "vp",
      price_low: last.priceLow,
      price_high: last.priceHigh,
      bins: binArr,
      poc: levels?.poc,
      vah: levels?.vah,
      val: levels?.val,
    };
    result.profiles.push(profile);
  });
  safe("mfi", () => {
    if (!has("mfi")) return;
    result.series.push(seriesFrom("mfi", bars, new W.MFI(14).batch(high, low, close, volume), "sub"));
  });
  safe("cmf", () => {
    if (!has("cmf")) return;
    result.series.push(
      seriesFrom("cmf", bars, new W.ChaikinMoneyFlow(20).batch(high, low, close, volume), "sub"),
    );
  });
  safe("kama", () => {
    if (!has("kama")) return;
    result.series.push(seriesFrom("kama", bars, new W.KAMA(10, 2, 30).batch(close)));
  });
  safe("supertrend", () => {
    if (!has("supertrend")) return;
    const v = new W.SuperTrend(10, 3).batch(high, low, close);
    result.series.push(seriesFrom("supertrend", bars, v, "main_price", v.length >= bars.length * 2 ? 2 : 1, 0));
  });
  safe("hma", () => {
    if (!has("hma")) return;
    result.series.push(seriesFrom("hma", bars, new W.HMA(20).batch(close)));
  });
  safe("alma", () => {
    if (!has("alma")) return;
    result.series.push(seriesFrom("alma", bars, new W.ALMA(9, 0.85, 6).batch(close)));
  });
  safe("ichimoku", () => {
    if (!has("ichimoku")) return;
    const v = new W.Ichimoku(9, 26, 52, 26).batch(high, low, close);
    const stride = 5;
    result.series.push(seriesFrom("ichi_tenkan", bars, v, "main_price", stride, 0));
    result.series.push(seriesFrom("ichi_kijun", bars, v, "main_price", stride, 1));
    for (let i = 0; i < bars.length - 1; i++) {
      const sa = v[i * stride + 2];
      const sb = v[i * stride + 3];
      if (![sa, sb].every(Number.isFinite)) continue;
      result.clouds!.push({
        id: `ichi-cloud-${i}`,
        start_time: bars[i].time,
        end_time: bars[i + 1].time,
        top: Math.max(sa, sb),
        bottom: Math.min(sa, sb),
        bullish: sa >= sb,
      });
    }
  });
  safe("adx", () => {
    if (!has("adx")) return;
    const v = new W.ADX(14).batch(high, low, close);
    result.series.push(seriesFrom("adx", bars, v, "sub", 3, 2));
    result.series.push(seriesFrom("plus_di", bars, v, "sub", 3, 0));
    result.series.push(seriesFrom("minus_di", bars, v, "sub", 3, 1));
  });
  safe("keltner", () => {
    if (!has("keltner")) return;
    const v = new W.Keltner(20, 10, 2).batch(high, low, close);
    result.series.push(seriesFrom("kelt_u", bars, v, "main_price", 3, 0));
    result.series.push(seriesFrom("kelt_m", bars, v, "main_price", 3, 1));
    result.series.push(seriesFrom("kelt_l", bars, v, "main_price", 3, 2));
  });
  safe("donchian", () => {
    if (!has("donchian")) return;
    const v = new W.Donchian(20).batch(high, low);
    result.series.push(seriesFrom("don_u", bars, v, "main_price", 3, 0));
    result.series.push(seriesFrom("don_m", bars, v, "main_price", 3, 1));
    result.series.push(seriesFrom("don_l", bars, v, "main_price", 3, 2));
  });
  safe("hilbert", () => {
    if (!has("hilbert")) return;
    result.series.push(
      seriesFrom("hilbert", bars, new W.HilbertDominantCycle().batch(close), "sub"),
    );
  });
  safe("hurst", () => {
    if (!has("hurst")) return;
    try {
      result.series.push(
        seriesFrom("hurst", bars, new W.HurstExponent(100, 10).batch(close), "sub"),
      );
    } catch {
      result.series.push(seriesFrom("hurst", bars, new W.HurstExponent(50, 5).batch(close), "sub"));
    }
  });
  safe("garch", () => {
    if (!has("garch")) return;
    result.series.push(seriesFrom("garch", bars, new W.Garch11(0.000002, 0.1, 0.88).batch(close), "sub"));
  });
  safe("rolling_corr", () => {
    if (!has("rolling_corr") || !req.benchmarkCloses || req.benchmarkCloses.length !== bars.length) return;
    const bench = f64(req.benchmarkCloses);
    result.series.push(
      seriesFrom("corr_spy", bars, new W.RollingCorrelation(20).batch(close, bench), "sub"),
    );
  });
  safe("tddwave", () => {
    if (!has("tddwave")) return;
    const ind = new W.TDDWave(2);
    const vals = new Float64Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const v = ind.update(b.high, b.low, b.close) as number | undefined;
      vals[i] = v ?? Number.NaN;
      if (v && v > 0) {
        result.structures.push({
          id: `tdw-${i}`,
          kind: "tddwave",
          label: `TD${v}`,
          points: [{ time: b.time, price: b.close }],
        });
      }
    }
    result.series.push(seriesFrom("tddwave", bars, vals, "sub"));
  });

  safe("harmonic", () => {
    if (!has("harmonic")) return;
    result.structures.push(...detectHarmonic(W, bars));
  });

  return result;
}
