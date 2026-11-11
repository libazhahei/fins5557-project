import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";

type CompareResponse = {
  runs: { id: string; name: string; params: Record<string, unknown>; summary: Record<string, unknown> }[];
  param_diff: { key: string; values: Record<string, unknown> }[];
  kpi_diff: { metric: string; values: Record<string, unknown> }[];
  equity_aligned: { time: number; values: Record<string, number | null> }[];
};

type Props = {
  compareIds: string[];
};

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(4) : "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
  return String(v);
}

export function RunDiffPanel({ compareIds }: Props) {
  const { t } = useTranslation();
  const enabled = compareIds.length >= 2;
  const compare = useQuery({
    queryKey: ["compare", compareIds.join(",")],
    enabled,
    queryFn: () =>
      api<CompareResponse>(`/runs/compare?ids=${encodeURIComponent(compareIds.join(","))}`),
  });

  if (!enabled) {
    return (
      <div className="text-[11px] text-zinc-600">
        <p>{t("workspace.diffShellHint")}</p>
        <p className="mt-2 text-[10px] text-zinc-500">{t("workspace.diffStub")}</p>
      </div>
    );
  }

  if (compare.isLoading) return <p className="text-[11px] text-zinc-500">{t("common.loading")}</p>;
  if (compare.isError) {
    return <p className="text-[11px] text-red-600">{(compare.error as Error).message}</p>;
  }

  const data = compare.data;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-3 text-[11px]">
      <section>
        <h3 className="font-semibold">{t("workspace.diffParams")}</h3>
        {(data.param_diff || []).length === 0 && (
          <p className="text-zinc-500">{t("workspace.diffNoParamDiff")}</p>
        )}
        <ul className="mt-1 space-y-1">
          {(data.param_diff || []).map((row) => (
            <li key={row.key} className="rounded border border-zinc-200 p-1">
              <div className="font-medium">{row.key}</div>
              {Object.entries(row.values).map(([id, val]) => (
                <div key={id} className="text-[10px] text-zinc-600">
                  #{id.slice(0, 6)}: {fmt(val)}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold">{t("workspace.diffKpis")}</h3>
        <table className="mt-1 w-full text-left text-[10px]">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th>Metric</th>
              {data.runs.map((r) => (
                <th key={r.id}>#{r.id.slice(0, 4)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.kpi_diff || []).map((row) => (
              <tr key={row.metric} className="border-b border-zinc-100">
                <td className="py-0.5">{row.metric}</td>
                {data.runs.map((r) => (
                  <td key={r.id}>{fmt(row.values[r.id])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[10px] text-zinc-500">
        {t("workspace.diffEquityHint")} ({(data.equity_aligned || []).length} pts)
      </p>
    </div>
  );
}

export type { CompareResponse };
