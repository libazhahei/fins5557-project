import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, type Run } from "../api";
import { AppShell } from "../components/Shell";

export function RunsPage() {
  const { t } = useTranslation();
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<{ runs: Run[] }>("/runs"),
  });

  return (
    <AppShell>
      <div className="h-full overflow-auto p-3">
        <h1 className="mb-2 text-sm font-semibold">{t("runs.title")}</h1>
        <div className="flex flex-col gap-1.5">
          {(runs.data?.runs || []).map((r) => (
            <article
              key={r.id}
              className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-[11px]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {r.name} · {r.template} · {r.status}
                </div>
                <div className="text-zinc-500">
                  Sharpe {Number(r.summary?.sharpe ?? NaN).toFixed(2)} · {r.created_at}
                </div>
              </div>
              <Link
                to={`/workspace?runId=${r.id}`}
                className="shrink-0 rounded bg-blue-600 px-2 py-1 text-white"
              >
                {t("runs.open")}
              </Link>
            </article>
          ))}
          {!runs.data?.runs?.length && (
            <p className="text-[11px] text-zinc-500">{t("runs.empty")}</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
