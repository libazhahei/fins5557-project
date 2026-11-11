import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Run } from "../../api";
import type { RunFormState } from "../types";

type Template = { id: string; name: string; tickers: string[] };

type Props = {
  form: RunFormState;
  setForm: (next: RunFormState | ((f: RunFormState) => RunFormState)) => void;
  templates: Template[];
  runs: Run[];
  activeRunId?: string;
  compareSel: string[];
  setCompareSel: (ids: string[] | ((prev: string[]) => string[])) => void;
  onPickTemplate: (id: string, tickers: string[]) => void;
  onImportMedium: () => void;
  onRun: () => void;
  onSelectRun: (id: string) => void;
  runPending: boolean;
  runError?: string | null;
};

function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-1 text-[10px]">
      <span className="truncate text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function num(v: unknown, d = 2): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(d);
}

export function StrategyLabPanel({
  form,
  setForm,
  templates,
  runs,
  activeRunId,
  compareSel,
  setCompareSel,
  onPickTemplate,
  onImportMedium,
  onRun,
  onSelectRun,
  runPending,
  runError,
}: Props) {
  const { t } = useTranslation();

  return (
    <aside className="flex h-full flex-col gap-1.5 overflow-auto border-r border-zinc-200 bg-white p-1.5">
      <div className="text-[11px] font-semibold text-zinc-700">{t("workspace.templates")}</div>
      <div className="flex flex-wrap gap-1">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={`rounded border px-1.5 py-0.5 text-[10px] ${
              form.templateId === tpl.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-300 hover:border-blue-600"
            }`}
            onClick={() => onPickTemplate(tpl.id, tpl.tickers)}
          >
            {tpl.name}
          </button>
        ))}
        <button
          type="button"
          className="rounded border border-dashed border-zinc-400 px-1.5 py-0.5 text-[10px] text-zinc-600"
          onClick={onImportMedium}
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
        disabled={runPending}
        onClick={onRun}
      >
        {runPending ? t("common.loading") : t("workspace.run")}
      </button>
      {runError && <p className="text-[10px] text-red-600">{runError}</p>}

      <div className="mt-1 text-[11px] font-semibold">{t("workspace.recent")}</div>
      <ul className="flex flex-col gap-0.5">
        {runs.slice(0, 5).map((r) => (
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
              onClick={() => onSelectRun(r.id)}
            >
              #{r.id.slice(0, 4)} {r.name} S:{num(r.summary?.sharpe)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
