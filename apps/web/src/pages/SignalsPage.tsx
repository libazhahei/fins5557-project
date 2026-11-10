import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, getToken } from "../api";
import { AppShell } from "../components/Shell";

type Signal = {
  run_id: string;
  name: string;
  template: string | null;
  last_target_weights: Record<string, number>;
  note: string;
};

export function SignalsPage() {
  const { t } = useTranslation();
  const loggedIn = Boolean(getToken());
  const q = useQuery({
    queryKey: ["signals"],
    enabled: loggedIn,
    queryFn: () => api<{ signals: Signal[]; note: string }>("/signals/daily"),
  });

  return (
    <AppShell>
      <div className="h-full overflow-auto p-3">
        <h1 className="mb-1 text-sm font-semibold">
          {t("signals.title")}{" "}
          <span className="rounded bg-zinc-500 px-1 text-[9px] text-white">{t("common.step4")}</span>
        </h1>
        <p className="mb-3 text-[11px] text-zinc-600">{t("signals.placeholder")}</p>
        {!loggedIn && (
          <p className="text-[11px]">
            <Link to="/login?next=/signals" className="text-blue-700">
              {t("common.login")}
            </Link>{" "}
            — {t("common.needLogin")}
          </p>
        )}
        {loggedIn && !(q.data?.signals || []).length && (
          <p className="text-[11px] text-zinc-500">{t("signals.empty")}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data?.signals || []).map((s) => (
            <article key={s.run_id} className="rounded border border-zinc-200 bg-white p-2 text-[11px]">
              <div className="font-semibold">{s.name}</div>
              <div className="text-zinc-500">{s.template}</div>
              <pre className="mt-1 overflow-auto text-[10px]">
                {JSON.stringify(s.last_target_weights, null, 2)}
              </pre>
              <Link className="mt-1 inline-block text-blue-700" to={`/workspace?runId=${s.run_id}`}>
                → Workspace
              </Link>
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
