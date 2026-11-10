import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import {
  api,
  getToken,
  type OverlayMarker,
  type Overlays,
  type Run,
} from "../api";
import { AppShell } from "../components/Shell";
import { ChartPanel, type Candle } from "../components/ChartPanel";
import { DEFAULT_FORM, type RunFormState } from "./types";
import type { ReactNode } from "react";

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

export function WorkspacePage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const runId = params.get("runId");
  const compareIds = (params.get("compareIds") || "").split(",").filter(Boolean);

  const [form, setForm] = useState<RunFormState>(DEFAULT_FORM);
  const [symbol, setSymbol] = useState("SPY");
  const [showMarkers, setShowMarkers] = useState(true);
  const [rightTab, setRightTab] = useState<"ai" | "trades" | "diff">("ai");
  const [toast, setToast] = useState<string | null>(null);
  const [mediumOpen, setMediumOpen] = useState(false);
  const [mediumText, setMediumText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string; text: string }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>(compareIds);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "quantlab-workspace",
    storage: localStorage,
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
    queryKey: ["overlays", activeRunId],
    enabled: Boolean(activeRunId),
    queryFn: () => api<Overlays>(`/runs/${activeRunId}/overlays`),
  });

  const bars = useQuery({
    queryKey: ["bars", symbol, run.data?.panel_uri],
    enabled: Boolean(run.data?.panel_uri || true),
    queryFn: () => {
      const q = new URLSearchParams({ symbol, limit: "600" });
      if (run.data?.panel_uri) q.set("panel_uri", run.data.panel_uri);
      return api<{ bars: Candle[] }>(`/bars?${q}`);
    },
  });

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
    if (tickers[0]) setSymbol(tickers[0]);
  }, [run.data?.id]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

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

  const chartMarkers = useMemo(() => {
    const ms = overlays.data?.markers || [];
    return ms
      .filter((m: OverlayMarker) => !symbol || m.symbol === symbol || m.action)
      .filter((m) => m.symbol === symbol)
      .map((m) => ({
        time: m.time,
        shape: (m.action === "SELL" || m.action === "REDUCE" ? "arrowDown" : "arrowUp") as
          | "arrowUp"
          | "arrowDown",
        text: m.action,
      }));
  }, [overlays.data?.markers, symbol]);

  const symbols = (form.symbols.length ? form.symbols : ["SPY"]).concat(
    form.symbols.includes("SHY") ? [] : [],
  );

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

  return (
    <AppShell dense>
      <div className="relative flex h-full min-h-0 flex-col">
        {toast && (
          <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded bg-zinc-900 px-3 py-1 text-[11px] text-white">
            {toast}
          </div>
        )}
        <Group
          orientation="horizontal"
          className="h-full"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="left" defaultSize="22%" minSize="16%" maxSize="36%">
            <aside className="flex h-full flex-col gap-1.5 overflow-auto border-r border-zinc-200 bg-white p-1.5">
              <div className="text-[11px] font-semibold text-zinc-700">{t("workspace.templates")}</div>
              <div className="flex flex-wrap gap-1">
                {(templates.data?.templates || []).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                      form.templateId === tpl.id
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-zinc-300 hover:border-blue-600"
                    }`}
                    onClick={() => pickTemplate(tpl.id, tpl.tickers)}
                  >
                    {tpl.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded border border-dashed border-zinc-400 px-1.5 py-0.5 text-[10px] text-zinc-600"
                  onClick={() => setMediumOpen(true)}
                >
                  {t("workspace.importMedium")}
                </button>
              </div>

              <div className="mt-1 text-[11px] font-semibold">{t("workspace.params")}</div>
              <ParamRow label={t("workspace.symbols")}>
                <input
                  className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[11px]"
                  value={form.symbols.join(",")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      symbols: e.target.value
                        .split(/[,\s]+/)
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </ParamRow>
              <ParamRow label={t("workspace.range")}>
                <div className="flex gap-1">
                  <input
                    type="date"
                    className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[10px]"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                  <input
                    type="date"
                    className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[10px]"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </div>
              </ParamRow>
              <ParamRow label={t("workspace.targetVol")}>
                <input
                  type="number"
                  step="0.5"
                  className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[11px]"
                  value={form.targetVol}
                  onChange={(e) => setForm({ ...form, targetVol: Number(e.target.value) })}
                />
              </ParamRow>
              <ParamRow label={t("workspace.maWindow")}>
                <input
                  type="number"
                  className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[11px]"
                  value={form.maWindow}
                  onChange={(e) => setForm({ ...form, maWindow: Number(e.target.value) })}
                />
              </ParamRow>
              <ParamRow label={t("workspace.rebalance")}>
                <select
                  className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[11px]"
                  value={form.rebalance}
                  onChange={(e) => setForm({ ...form, rebalance: e.target.value })}
                >
                  <option value="Monthly">{t("workspace.monthly")}</option>
                </select>
              </ParamRow>
              <ParamRow label={t("workspace.cost")}>
                <input
                  type="number"
                  className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[11px]"
                  value={form.costBps}
                  onChange={(e) => setForm({ ...form, costBps: Number(e.target.value) })}
                />
              </ParamRow>
              <ParamRow label={t("workspace.benchmark")}>
                <input
                  className="h-[26px] w-full rounded border border-zinc-300 px-1 text-[11px]"
                  value={form.benchmark}
                  readOnly
                />
              </ParamRow>
              <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={form.enableMc}
                  onChange={(e) => setForm({ ...form, enableMc: e.target.checked })}
                />
                {t("workspace.enableMc")}
              </label>
              <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={form.enableRv}
                  onChange={(e) => setForm({ ...form, enableRv: e.target.checked })}
                />
                {t("workspace.enableRv")}
              </label>
              <button
                type="button"
                className="h-8 rounded bg-blue-600 text-[12px] font-semibold text-white disabled:opacity-60"
                disabled={runMut.isPending}
                onClick={() => runMut.mutate(undefined)}
              >
                {runMut.isPending ? t("common.loading") : t("workspace.run")}
              </button>
              {runMut.isError && (
                <p className="text-[10px] text-red-600">{(runMut.error as Error).message}</p>
              )}

              <div className="mt-1 text-[11px] font-semibold">{t("workspace.recent")}</div>
              <ul className="flex flex-col gap-0.5">
                {(runs.data?.runs || []).slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] ${
                      r.id === activeRunId ? "border-blue-600 bg-blue-50" : "border-zinc-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={compareSel.includes(r.id)}
                      onChange={(e) => {
                        setCompareSel((prev) =>
                          e.target.checked ? [...prev, r.id].slice(0, 3) : prev.filter((x) => x !== r.id),
                        );
                      }}
                      title={t("workspace.compare")}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() =>
                        setParams((prev) => {
                          const n = new URLSearchParams(prev);
                          n.set("runId", r.id);
                          return n;
                        })
                      }
                    >
                      #{r.id.slice(0, 4)} {r.name} S:{num(r.summary?.sharpe)}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </Panel>

          <Separator className="w-1 bg-zinc-200 data-[separator]:hover:bg-blue-600" />

          <Panel id="center" defaultSize="53%" minSize="35%">
            <section className="flex h-full min-h-0 flex-col gap-1 overflow-hidden bg-zinc-50 p-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[10px]">
                <div className="truncate">
                  {activeRunId ? (
                    <>
                      Run #{activeRunId.slice(0, 8)} · {run.data?.name} ·{" "}
                      {(form.symbols || []).join(",")} · {form.startDate.slice(2, 7)}–
                      {form.endDate.slice(2, 7)} · Vol:{form.targetVol}% · Cost:{form.costBps}bp
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
                      setRightTab("diff");
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
                    {run.data?.is_subscribed_daily ? t("workspace.subscribed") : t("workspace.subscribe")}
                  </button>
                </div>
              </div>

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
                      : summary.avg_turnover != null
                        ? `${(Number(summary.avg_turnover) * 100).toFixed(1)}%`
                        : "—"
                  }
                />
              </div>

              <div className="flex items-center gap-1 text-[10px]">
                {symbols.map((s) => (
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
                <button
                  type="button"
                  className="ml-auto rounded border border-zinc-300 px-1.5 py-0.5"
                  onClick={() => setShowMarkers((v) => !v)}
                >
                  {t("workspace.showMarkers")}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded border border-zinc-200 bg-white p-1">
                {bars.data?.bars?.length ? (
                  <ChartPanel
                    symbol={symbol}
                    candles={bars.data.bars}
                    equity={overlays.data?.equity}
                    benchmark={overlays.data?.benchmark_equity}
                    markers={chartMarkers}
                    showMarkers={showMarkers}
                    candleHeight={200}
                    equityHeight={120}
                  />
                ) : (
                  <p className="p-4 text-[11px] text-zinc-500">{t("workspace.emptyRun")}</p>
                )}
              </div>

              <PipelineBar steps={run.data?.steps_trace || []} />
            </section>
          </Panel>

          <Separator className="w-1 bg-zinc-200 data-[separator]:hover:bg-blue-600" />

          <Panel id="right" defaultSize="25%" minSize="18%" maxSize="40%">
            <aside className="flex h-full min-h-0 flex-col gap-1 overflow-hidden border-l border-zinc-200 bg-white p-1.5">
              <div className="flex gap-1 text-[10px]">
                {(
                  [
                    ["ai", t("workspace.tabAi")],
                    ["trades", t("workspace.tabTrades")],
                    ["diff", `${t("workspace.tabDiff")} (${t("common.step2")})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded px-1.5 py-0.5 ${
                      rightTab === id ? "bg-zinc-900 text-white" : "border border-zinc-300"
                    }`}
                    onClick={() => setRightTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-auto text-[11px]">
                {rightTab === "ai" && (
                  <div className="flex flex-col gap-2">
                    <section>
                      <h3 className="font-semibold">{t("workspace.coreConclusion")}</h3>
                      <p className="text-zinc-700">{narrative?.headline || "—"}</p>
                    </section>
                    <section>
                      <h3 className="font-semibold">{t("workspace.riskAttribution")}</h3>
                      <p className="text-zinc-700">{narrative?.attribution || "—"}</p>
                    </section>
                    <section>
                      <h3 className="font-semibold">{t("workspace.honestWarning")}</h3>
                      <ul className="list-disc pl-4 text-zinc-600">
                        {(narrative?.honest_warnings || []).map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </section>
                    <div className="flex flex-wrap gap-1">
                      {(narrative?.next_actions || []).map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          className="rounded border border-amber-500 bg-amber-50 px-1.5 py-0.5 text-[10px]"
                          onClick={() => {
                            const patched = applyPatch(form, a.patch_params);
                            setForm(patched);
                            runMut.mutate(patched);
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {rightTab === "trades" && (
                  <div>
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="border-b border-zinc-200 text-zinc-500">
                          <th className="py-0.5">Date</th>
                          <th>Sym</th>
                          <th>Act</th>
                          <th>Δw</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(overlays.data?.markers || []).slice(0, 8).map((m, i) => (
                          <tr key={`${m.time}-${m.symbol}-${i}`} className="border-b border-zinc-100">
                            <td className="py-0.5">
                              {new Date(m.time * 1000).toISOString().slice(2, 10)}
                            </td>
                            <td>{m.symbol}</td>
                            <td>{m.action}</td>
                            <td>
                              {m.weight_before != null && m.weight_after != null
                                ? `${(m.weight_before * 100).toFixed(0)}%→${(m.weight_after * 100).toFixed(0)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-zinc-500">{t("workspace.tradeStub")}</p>
                  </div>
                )}
                {rightTab === "diff" && (
                  <div>
                    <p className="text-zinc-600">
                      {compareIds.length
                        ? `compareIds=${compareIds.join(",")}`
                        : t("workspace.diffStub")}
                    </p>
                    <p className="mt-2 text-[10px] text-zinc-500">{t("workspace.diffStub")}</p>
                  </div>
                )}
              </div>

              <div className="flex h-36 shrink-0 flex-col rounded border border-zinc-200">
                <div className="border-b border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
                  Agent · Gemini
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1 text-[10px]">
                  {!getToken() && (
                    <p className="text-zinc-500">
                      {t("workspace.chatLogin")} —{" "}
                      <Link className="text-blue-700" to="/login?next=/workspace">
                        {t("common.login")}
                      </Link>
                    </p>
                  )}
                  {chatLog.map((m, i) => (
                    <div key={i} className="mb-1">
                      <strong>{m.role === "user" ? ">" : "Lab"}</strong> {m.text}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 border-t border-zinc-200 p-1">
                  <input
                    className="h-7 min-w-0 flex-1 rounded border border-zinc-300 px-1 text-[10px]"
                    value={chatInput}
                    placeholder={t("workspace.chatPlaceholder")}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void sendChat()}
                  />
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-2 text-[10px] text-white"
                    onClick={() => void sendChat()}
                  >
                    {t("common.send")}
                  </button>
                </div>
              </div>
            </aside>
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

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-1 text-[10px]">
      <span className="truncate text-zinc-500">{label}</span>
      {children}
    </div>
  );
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

function PipelineBar({
  steps,
}: {
  steps: { module_id: string; name: string; status: string; duration_ms: number; io_summary?: string }[];
}) {
  const defaults = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"];
  const byId = Object.fromEntries(steps.map((s) => [s.module_id, s]));
  return (
    <div className="flex h-8 items-center gap-1 overflow-x-auto rounded border border-zinc-200 bg-white px-1 text-[9px]">
      {defaults.map((id, i) => {
        const s = byId[id];
        const status = s?.status || "placeholder";
        const done = status === "completed";
        const stub = status === "placeholder" || status === "not_implemented_in_step1" || status === "skipped";
        return (
          <span key={id} className="inline-flex items-center gap-1">
            <span
              title={s ? `${s.name} · ${s.io_summary || ""}` : id}
              className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 ${
                done
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : stub
                    ? "border-dashed border-zinc-400 text-zinc-500"
                    : "border-zinc-300"
              }`}
            >
              {done ? "OK" : stub ? "…" : "·"} {id}
              {done && s ? ` ${s.duration_ms}ms` : ""}
            </span>
            {i < defaults.length - 1 && <span className="text-zinc-300">→</span>}
          </span>
        );
      })}
    </div>
  );
}
