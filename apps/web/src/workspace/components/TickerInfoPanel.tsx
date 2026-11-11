import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IndicatorResult } from "../../wasm/types";
import type { TickerOverview } from "../types";
import type { CandleBar } from "./KlineChartCanvas";
import { MiniSpark } from "./MiniSpark";

type Props = {
  overview?: TickerOverview | null;
  loading?: boolean;
  onAddToStrategy?: (symbol: string) => void;
  wasmScalars?: Record<string, number | null | undefined> | null;
  bars?: CandleBar[];
  indicatorResult?: IndicatorResult | null;
};

function fmt(v: unknown, digits = 2, suffix = ""): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(digits)}${suffix}`;
}

function seriesTail(
  result: IndicatorResult | null | undefined,
  id: string,
  n = 60,
): { value: number }[] {
  const s = result?.series?.find((x) => x.id === id);
  if (!s?.values?.length) return [];
  return s.values
    .filter((p) => Number.isFinite(p.value))
    .slice(-n)
    .map((p) => ({ value: p.value }));
}

export function TickerInfoPanel({
  overview,
  loading,
  onAddToStrategy,
  wasmScalars,
  bars = [],
  indicatorResult,
}: Props) {
  const { t } = useTranslation();
  const volTail = useMemo(
    () =>
      bars
        .slice(-60)
        .map((b) => ({ value: b.volume ?? 0 }))
        .filter((p) => p.value > 0),
    [bars],
  );
  const hvTail = useMemo(() => seriesTail(indicatorResult, "hv20"), [indicatorResult]);
  const atrTail = useMemo(() => seriesTail(indicatorResult, "atr14"), [indicatorResult]);

  if (loading) return <p className="text-[11px] text-zinc-500">{t("common.loading")}</p>;
  if (!overview) return <p className="text-[11px] text-zinc-500">{t("workspace.emptyTicker")}</p>;

  const f = overview.fundamentals || {};
  const v = overview.volatility_metrics || {};
  const chg = overview.quote.change_pct;
  const wasmHv = wasmScalars?.hv_20;
  const wasmAtr = wasmScalars?.atr_14;
  const wasmHvPct = wasmScalars?.hv_percentile;

  return (
    <div className="flex flex-col gap-2 text-[11px]">
      <header className="rounded border border-zinc-200 p-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold">{overview.name}</div>
            <div className="text-[10px] text-zinc-500">
              {overview.symbol} · {overview.asset_type} · {overview.data_source}
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded border border-blue-600 px-1.5 py-0.5 text-[10px] text-blue-700"
            onClick={() => onAddToStrategy?.(overview.symbol)}
          >
            {t("workspace.addToStrategy")}
          </button>
        </div>
        <div className="mt-1 text-[18px] font-bold leading-tight">
          {fmt(overview.quote.last_price)}
        </div>
        <div className={`text-[12px] font-semibold ${chg >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {chg >= 0 ? "+" : ""}
          {fmt(overview.quote.change)} ({chg >= 0 ? "+" : ""}
          {(chg * 100).toFixed(2)}%)
        </div>
      </header>

      <section className="rounded border border-zinc-200 p-2">
        <h3 className="mb-1 font-semibold">{t("workspace.fundamentals")}</h3>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
          <div>
            <dt className="text-zinc-500">P/E TTM</dt>
            <dd>{fmt(f.pe_ttm)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Fwd P/E</dt>
            <dd>{fmt(f.pe_forward)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">P/B</dt>
            <dd>{fmt(f.pb_ratio)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Div Yield</dt>
            <dd>{fmt(f.dividend_yield != null ? Number(f.dividend_yield) * 100 : null, 2, "%")}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">52W High</dt>
            <dd>{fmt(f.week_52_high)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">52W Low</dt>
            <dd>{fmt(f.week_52_low)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded border border-zinc-200 p-2">
        <h3 className="mb-1 font-semibold">{t("workspace.volatility")}</h3>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
          <div>
            <dt className="text-zinc-500">20D HV</dt>
            <dd>
              {fmt(
                wasmHv != null
                  ? Number(wasmHv) > 1
                    ? Number(wasmHv)
                    : Number(wasmHv) * 100
                  : v.hv_20d != null
                    ? Number(v.hv_20d) * 100
                    : null,
                1,
                "%",
              )}
              {wasmHv != null ? <span className="ml-0.5 text-zinc-400">wasm</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">60D HV</dt>
            <dd>{fmt(v.hv_60d != null ? Number(v.hv_60d) * 100 : null, 1, "%")}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">1Y HV %ile</dt>
            <dd>
              {fmt(
                wasmHvPct != null ? Number(wasmHvPct) * 100 : v.hv_percentile_1y,
                0,
                wasmHvPct != null ? "%" : "",
              )}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">ATR 14D</dt>
            <dd>
              {fmt(wasmAtr ?? v.atr_14d)}
              {wasmAtr != null ? <span className="ml-0.5 text-zinc-400">wasm</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Beta SPY</dt>
            <dd>{fmt(v.beta_spy)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">MaxDD 1Y</dt>
            <dd>{fmt(v.max_drawdown_1y != null ? Number(v.max_drawdown_1y) * 100 : null, 1, "%")}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="font-semibold">{t("workspace.visualMetrics", { defaultValue: "Visuals" })}</h3>
        <MiniSpark title="Volume" values={volTail} kind="bars" />
        <MiniSpark title="HV 20" values={hvTail} kind="line" />
        <MiniSpark title="ATR 14" values={atrTail} kind="line" />
      </section>

      {(overview.extra_sections || []).map((sec) => (
        <section key={sec.section_id} className="rounded border border-zinc-200 p-2">
          <h3 className="mb-1 font-semibold">{sec.title}</h3>
          <ul className="text-[10px]">
            {sec.items.map((it) => (
              <li key={it.label} className="flex justify-between gap-2">
                <span className="text-zinc-500">{it.label}</span>
                <span>
                  {it.value}
                  {it.unit || ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
