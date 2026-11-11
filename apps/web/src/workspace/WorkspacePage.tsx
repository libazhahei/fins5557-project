import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { api, getToken, type Overlays, type Ready, type Run } from "../api";
import { AppShell } from "../components/Shell";
import { useIndicatorEngine } from "../wasm/indicatorEngine";
import { ActivityBar } from "./components/ActivityBar";
import {
  ChartWorkspace,
  DEFAULT_CHART_FEATURES,
  type ChartTimeframe,
} from "./components/ChartWorkspace";
import { EquityBenchmarkChart } from "./components/EquityBenchmarkChart";
import { PipelineBar } from "./components/PipelineBar";
import { RightInspector } from "./components/RightInspector";
import { StrategyLabPanel } from "./components/StrategyLabPanel";
import { WatchlistPanel } from "./components/WatchlistPanel";
import { resampleBarsToWeekly } from "./lib/resampleBars";
import type { VpView } from "./lib/vpWindow";
import {
  DEFAULT_FORM,
  type ActivityMode,
  type ChartTradeLogMarker,
  type PredictionOverlay,
  type RightTab,
  type RunFormState,
  type TickerOverview,
} from "./types";

function pct(v: unknown): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

function num(v: unknown, d = 2): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(d);
}

function applyPatch(form: RunFormState, patch: Record<string, unknown>): RunFormState {
  const next = { ...form };
  if (typeof patch.cost_bps === "number") next.costBps = patch.cost_bps;
  const sp = patch.strategy_params as Record<string, unknown> | undefined;
  if (sp) {
    if (typeof sp.vol_target === "number") next.targetVol = Math.round(sp.vol_target * 1000) / 10;
    if (typeof sp.trend_days === "number") next.maWindow = sp.trend_days;
  }
  return next;
}

function Kpi({
  label,
  value,
  vs,
  vsLabel,
}: {
  label: string;
  value: string;
  vs?: string;
  vsLabel?: string;
}) {
  return (
    <div className="rounded border border-zinc-200 bg-white px-1.5 py-1">
      <div className="text-[9px] text-zinc-500">{label}</div>
      <div className="text-[15px] font-bold leading-tight">{value}</div>
      {vs != null && (
        <div className="text-[9px] text-zinc-500">
          {vsLabel}: {vs}
        </div>
      )}
    </div>
  );
}

export function WorkspacePage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const runId = params.get("runId");
  const compareIds = (params.get("compareIds") || "").split(",").filter(Boolean);

  const [activity, setActivity] = useState<ActivityMode>("lab");
  const [form, setForm] = useState<RunFormState>(DEFAULT_FORM);
  const [symbol, setSymbol] = useState("SPY");
  const [showTradeLogs, setShowTradeLogs] = useState(true);
  const [showPredictions, setShowPredictions] = useState(true);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("1d");
  const [vpView, setVpView] = useState<VpView | null>(null);
  const indicators = useIndicatorEngine();
  const [rightTab, setRightTab] = useState<RightTab>("ai");
  const onVpViewChange = useCallback((view: VpView) => {
    setVpView(view);
  }, []);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mediumOpen, setMediumOpen] = useState(false);
  const [mediumText, setMediumText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string; text: string }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>(compareIds);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "quantlab-workspace-v2",
    storage: localStorage,
  });

  const ready = useQuery({
    queryKey: ["ready"],
    queryFn: () => api<Ready>("/ready"),
    staleTime: 60_000,
  });

  const templates = useQuery({
    queryKey: ["templates", i18n.language],
    queryFn: () =>
      api<{ templates: { id: string; name: string; tickers: string[] }[] }>(
        `/runs/templates?locale=${encodeURIComponent(i18n.language)}`,
      ),
  });

  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<{ runs: Run[] }>("/runs"),
  });

  const activeRunId = runId || runs.data?.runs?.[0]?.id;
  const run = useQuery({
    queryKey: ["run", activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api<Run>(`/runs/${activeRunId}`),
  });

  const overlays = useQuery({
    queryKey: ["overlays", activeRunId, symbol],
    enabled: Boolean(activeRunId),
    queryFn: () =>
      api<Overlays>(
        `/runs/${activeRunId}/overlays?symbol=${encodeURIComponent(symbol)}`,
      ),
  });

  const marketBars = useQuery({
    queryKey: ["market-bars", symbol, activeRunId],
    queryFn: () => {
      const q = new URLSearchParams({
        limit: "600",
        include_predictions: "true",
      });
      if (activeRunId) q.set("run_id", activeRunId);
      return api<{
        bars: {
          time: number;
          timestamp?: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume?: number;
        }[];
        trade_logs?: ChartTradeLogMarker[];
        prediction_overlays?: PredictionOverlay[];
      }>(`/market/tickers/${symbol}/bars?${q}`);
    },
  });

  const overview = useQuery({
    queryKey: ["overview", symbol],
    queryFn: () => api<TickerOverview>(`/market/tickers/${symbol}/overview`),
  });

  useEffect(() => {
    const raw = marketBars.data?.bars;
    if (!raw?.length) return;
    const bars =
      chartTimeframe === "1w"
        ? resampleBarsToWeekly(raw)
        : raw;
    const view =
      vpView ??
      ({
        fromIdx: Math.max(0, bars.length - 80),
        toIdx: bars.length - 1,
      } satisfies VpView);
    const predIds = showPredictions ? (["arima", "hv_ewma"] as const) : [];
    indicators.compute({
      bars: bars.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
      view,
      enabled: [...new Set([...indicators.enabled, ...predIds])],
    });
  }, [
    marketBars.data?.bars,
    indicators.enabled,
    indicators.ready,
    symbol,
    chartTimeframe,
    vpView,
    showPredictions,
  ]);

  useEffect(() => {
    if (!run.data?.params) return;
    const p = run.data.params as Record<string, unknown>;
    const bt = (p.backtest || {}) as Record<string, unknown>;
    setForm((f) => ({
      ...f,
      templateId: run.data.template || f.templateId,
      symbols: (p.tickers as string[]) || f.symbols,
      startDate: (p.start_date as string) || f.startDate,
      endDate: (p.end_date as string) || f.endDate,
      costBps: Number(p.cost_bps ?? bt.cost_bps ?? f.costBps),
      targetVol: Number(bt.vol_target != null ? Number(bt.vol_target) * 100 : f.targetVol),
      maWindow: Number(bt.trend_days ?? f.maWindow),
    }));
    const tickers = (p.tickers as string[]) || [];
    if (tickers[0] && activity === "lab") setSymbol(tickers[0]);
  }, [run.data?.id]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const setActivityMode = (mode: ActivityMode) => {
    setActivity(mode);
    if (mode === "market") setRightTab("ticker");
    if (mode === "lab") setRightTab("ai");
    if (mode === "diff") setRightTab("diff");
  };

  const runMut = useMutation({
    mutationFn: async (override?: Partial<RunFormState>) => {
      const f = { ...form, ...override };
      return api<Run>("/runs/from-template", {
        method: "POST",
        body: JSON.stringify({
          template_id: f.templateId,
          symbols: f.symbols,
          start_date: f.startDate,
          end_date: f.endDate,
          cost_bps: f.costBps,
          strategy_params: {
            vol_target: f.targetVol / 100,
            trend_days: f.maWindow,
          },
          use_fixtures: true,
          enable_mc: f.enableMc,
          enable_rv_ml: f.enableRv,
          locale: i18n.language,
        }),
      });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["runs"] });
      setParams((prev) => {
        const n = new URLSearchParams(prev);
        n.set("runId", r.id);
        return n;
      });
      setActivityMode("lab");
    },
  });

  function pickTemplate(id: string, tickers: string[]) {
    setForm((f) => ({
      ...f,
      templateId: id,
      symbols: tickers.filter((x) => x !== "SHY").slice(0, 4),
    }));
  }

  const summary = (overlays.data?.summary || run.data?.summary || {}) as Record<string, unknown>;
  const narrative = run.data?.summary?.narrative;
  const tradeLogs: ChartTradeLogMarker[] =
    (overlays.data?.trade_logs as ChartTradeLogMarker[] | undefined) ||
    marketBars.data?.trade_logs ||
    [];
  const predictions: PredictionOverlay[] =
    (overlays.data?.prediction_overlays as PredictionOverlay[] | undefined) ||
    marketBars.data?.prediction_overlays ||
    [];

  const symbols = form.symbols.length ? form.symbols : ["SPY"];

  const equitySeries = useMemo(() => {
    if (activity === "diff" && compareSel.length >= 2 && overlays.data) {
      // Multi-run overlay fetched via RunDiffPanel; center uses current + compare stubs via overlays only for active
      return [
        {
          id: "run",
          label: "Run",
          color: "#2563eb",
          data: overlays.data.equity || [],
        },
        {
          id: "spy",
          label: "SPY",
          color: "#71717a",
          data: overlays.data.benchmark_equity || [],
        },
      ];
    }
    return [
      {
        id: "run",
        label: "Equity",
        color: "#2563eb",
        data: overlays.data?.equity || [],
      },
      {
        id: "spy",
        label: "SPY",
        color: "#71717a",
        data: overlays.data?.benchmark_equity || [],
      },
    ];
  }, [activity, compareSel.length, overlays.data]);

  const compareEquityQuery = useQuery({
    queryKey: ["compare-equity", compareSel.join(",")],
    enabled: activity === "diff" && compareSel.length >= 2,
    queryFn: () =>
      api<{
        equity_aligned: { time: number; values: Record<string, number | null> }[];
        runs: { id: string }[];
      }>(`/runs/compare?ids=${encodeURIComponent(compareSel.join(","))}`),
  });

  const diffSeries = useMemo(() => {
    const aligned = compareEquityQuery.data?.equity_aligned || [];
    const runsList = compareEquityQuery.data?.runs || [];
    const colors = ["#2563eb", "#dc2626", "#059669"];
    return runsList.map((r, i) => ({
      id: r.id,
      label: `#${r.id.slice(0, 4)}`,
      color: colors[i % colors.length],
      data: aligned
        .filter((p) => p.values[r.id] != null)
        .map((p) => ({ time: p.time, value: Number(p.values[r.id]) })),
    }));
  }, [compareEquityQuery.data]);

  async function saveIdea() {
    if (!getToken()) {
      nav(`/login?next=${encodeURIComponent("/workspace")}`);
      return;
    }
    await api("/ideas", {
      method: "POST",
      body: JSON.stringify({ raw_text: mediumText }),
    });
    setMediumOpen(false);
    setMediumText("");
    flash(t("workspace.mediumHint"));
  }

  async function subscribe() {
    if (!getToken()) {
      nav(`/login?next=${encodeURIComponent("/workspace")}`);
      return;
    }
    if (!activeRunId) return;
    await api(`/runs/${activeRunId}/subscribe`, {
      method: "POST",
      body: JSON.stringify({ subscribed: true }),
    });
    void qc.invalidateQueries({ queryKey: ["run", activeRunId] });
    flash(t("workspace.subscribed"));
  }

  async function sendChat() {
    if (!getToken()) {
      nav(`/login?next=${encodeURIComponent("/workspace")}`);
      return;
    }
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatLog((l) => [...l, { role: "user", text: msg }]);
    try {
      let sid = sessionId;
      if (!sid) {
        const s = await api<{ id: string }>("/agent/sessions", {
          method: "POST",
          body: JSON.stringify({}),
        });
        sid = s.id;
        setSessionId(sid);
      }
      const res = await api<{ text: string }>(`/agent/sessions/${sid}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      setChatLog((l) => [...l, { role: "assistant", text: res.text }]);
    } catch (e) {
      setChatLog((l) => [
        ...l,
        { role: "assistant", text: e instanceof Error ? e.message : String(e) },
      ]);
    }
  }

  const dataSourceLabel =
    ready.data?.data_source?.mode === "fixture"
      ? t("common.fixture")
      : ready.data?.data_source?.live_yahoo === "available"
        ? "Yahoo"
        : t("common.offline");

  const showStrategyChrome = activity === "lab" || activity === "diff";

  return (
    <AppShell dense>
      <div className="relative flex h-full min-h-0">
        {toast && (
          <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded bg-zinc-900 px-3 py-1 text-[11px] text-white">
            {toast}
          </div>
        )}
        <ActivityBar
          activity={activity}
          onChange={setActivityMode}
          dataSourceLabel={dataSourceLabel}
        />
        <Group
          orientation="horizontal"
          className="h-full min-w-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="left" defaultSize="20%" minSize="14%" maxSize="36%">
            {activity === "market" ? (
              <WatchlistPanel
                selectedSymbol={symbol}
                runSymbols={(run.data?.params?.tickers as string[]) || form.symbols}
                onSelect={(sym) => {
                  setSymbol(sym);
                  setRightTab("ticker");
                }}
              />
            ) : (
              <StrategyLabPanel
                form={form}
                setForm={setForm}
                templates={templates.data?.templates || []}
                runs={runs.data?.runs || []}
                activeRunId={activeRunId}
                compareSel={compareSel}
                setCompareSel={setCompareSel}
                onPickTemplate={pickTemplate}
                onImportMedium={() => setMediumOpen(true)}
                onRun={() => runMut.mutate(undefined)}
                onSelectRun={(id) =>
                  setParams((prev) => {
                    const n = new URLSearchParams(prev);
                    n.set("runId", id);
                    return n;
                  })
                }
                runPending={runMut.isPending}
                runError={runMut.isError ? (runMut.error as Error).message : null}
              />
            )}
          </Panel>

          <Separator className="w-1 bg-zinc-200" />

          <Panel id="center" defaultSize="58%" minSize="35%">
            <section className="flex h-full min-h-0 flex-col gap-1 overflow-hidden bg-zinc-50 p-1.5">
              {showStrategyChrome && (
                <div className="flex flex-wrap items-center justify-between gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[10px]">
                  <div className="truncate">
                    {activeRunId ? (
                      <>
                        Run #{activeRunId.slice(0, 8)} · {run.data?.name} ·{" "}
                        {(form.symbols || []).join(",")} · Vol:{form.targetVol}%
                      </>
                    ) : (
                      t("workspace.emptyRun")
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-1.5 py-0.5"
                      onClick={() => {
                        if (compareSel.length < 2) {
                          flash(t("workspace.compareRecorded"));
                          return;
                        }
                        setParams((prev) => {
                          const n = new URLSearchParams(prev);
                          n.set("compareIds", compareSel.join(","));
                          return n;
                        });
                        setActivityMode("diff");
                        flash(t("workspace.compareRecorded"));
                      }}
                    >
                      {t("workspace.addCompare")}
                    </button>
                    <button
                      type="button"
                      className={`rounded border px-1.5 py-0.5 ${
                        run.data?.is_subscribed_daily
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-zinc-300"
                      }`}
                      onClick={() => void subscribe()}
                    >
                      {run.data?.is_subscribed_daily
                        ? t("workspace.subscribed")
                        : t("workspace.subscribe")}
                    </button>
                  </div>
                </div>
              )}

              {showStrategyChrome && (
                <div className="grid h-12 grid-cols-6 gap-1">
                  <Kpi
                    label={t("workspace.kpiCagr")}
                    value={pct(summary.cagr)}
                    vs={pct(summary.benchmark_cagr)}
                    vsLabel={t("workspace.vsSpy")}
                  />
                  <Kpi
                    label={t("workspace.kpiMaxDd")}
                    value={pct(summary.max_dd)}
                    vs={pct(summary.benchmark_max_drawdown)}
                    vsLabel={t("workspace.vsSpy")}
                  />
                  <Kpi
                    label={t("workspace.kpiSharpe")}
                    value={num(summary.sharpe)}
                    vs={num(summary.benchmark_sharpe)}
                    vsLabel={t("workspace.vsSpy")}
                  />
                  <Kpi label={t("workspace.kpiSortino")} value={num(summary.sortino)} />
                  <Kpi label={t("workspace.kpiVol")} value={pct(summary.vol)} />
                  <Kpi
                    label={t("workspace.kpiTurnover")}
                    value={
                      summary.turnover != null
                        ? `${(Number(summary.turnover) * 100).toFixed(0)}%`
                        : "—"
                    }
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                <span className="font-semibold">{symbol}</span>
                {(activity === "market"
                  ? ["AAPL", "MSFT", "NVDA", "GOOG", "TQQQ", "SPY", "QQQ"]
                  : symbols
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rounded px-1.5 py-0.5 ${
                      s === symbol ? "bg-zinc-900 text-white" : "border border-zinc-300"
                    }`}
                    onClick={() => setSymbol(s)}
                  >
                    {s}
                  </button>
                ))}
                <label className="ml-2 inline-flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={showTradeLogs}
                    onChange={(e) => setShowTradeLogs(e.target.checked)}
                  />
                  Logs
                </label>
                <label className="inline-flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={showPredictions}
                    onChange={(e) => setShowPredictions(e.target.checked)}
                  />
                  Pred
                </label>
              </div>

              <div className="flex min-h-0 flex-[1.4] flex-col overflow-hidden">
                <ChartWorkspace
                  symbol={symbol}
                  bars={marketBars.data?.bars || []}
                  features={DEFAULT_CHART_FEATURES}
                  timeframe={chartTimeframe}
                  onTimeframeChange={setChartTimeframe}
                  enabled={indicators.enabled}
                  onToggle={indicators.toggle}
                  indicatorResult={indicators.result}
                  tradeLogs={tradeLogs}
                  predictions={predictions}
                  showTradeLogs={showTradeLogs}
                  showPredictions={showPredictions}
                  selectedLogId={selectedLogId}
                  error={indicators.error}
                  onVpViewChange={onVpViewChange}
                  onSelectLog={(id) => {
                    setSelectedLogId(id);
                    setRightTab("trades");
                  }}
                />
              </div>

              {showStrategyChrome && (
                <div className="shrink-0 overflow-hidden rounded border border-zinc-200 bg-white p-1">
                  <EquityBenchmarkChart
                    series={activity === "diff" && diffSeries.length ? diffSeries : equitySeries}
                    height={120}
                  />
                </div>
              )}

              {showStrategyChrome && <PipelineBar steps={run.data?.steps_trace || []} />}
            </section>
          </Panel>

          <Separator className="w-1 bg-zinc-200" />

          <Panel id="right" defaultSize="22%" minSize="16%" maxSize="40%">
            <RightInspector
              tab={rightTab}
              onTab={setRightTab}
              overview={overview.data}
              overviewLoading={overview.isLoading}
              wasmScalars={indicators.result.scalars}
              bars={marketBars.data?.bars || []}
              indicatorResult={indicators.result}
              onAddToStrategy={(sym) => {
                setForm((f) =>
                  f.symbols.includes(sym) ? f : { ...f, symbols: [...f.symbols, sym] },
                );
                setActivityMode("lab");
                flash(`${sym} → strategy`);
              }}
              tradeLogs={tradeLogs}
              selectedLogId={selectedLogId}
              onSelectLog={(id, log) => {
                setSelectedLogId(id);
                if (log.symbol) setSymbol(log.symbol);
              }}
              narrative={narrative}
              onAiAction={(patch) => {
                const patched = applyPatch(form, patch);
                setForm(patched);
                runMut.mutate(patched);
              }}
              compareIds={compareSel.length >= 2 ? compareSel : compareIds}
              chatLog={chatLog}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSendChat={() => void sendChat()}
            />
          </Panel>
        </Group>
      </div>

      {mediumOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="w-full max-w-lg rounded border border-zinc-200 bg-white p-3">
            <h2 className="text-sm font-semibold">{t("workspace.mediumTitle")}</h2>
            <p className="mt-1 text-[11px] text-zinc-600">{t("workspace.mediumHint")}</p>
            <textarea
              className="mt-2 h-40 w-full rounded border border-zinc-300 p-2 text-[11px]"
              value={mediumText}
              onChange={(e) => setMediumText(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-[11px]"
                onClick={() => setMediumOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white"
                onClick={() => void saveIdea()}
              >
                {t("workspace.mediumSave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
