import { useTranslation } from "react-i18next";
import type { Narrative } from "../../api";

type Props = {
  narrative?: Narrative | null;
  onAction: (patch: Record<string, unknown>) => void;
};

export function AiReportPanel({ narrative, onAction }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 text-[11px]">
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
            onClick={() => onAction(a.patch_params)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
