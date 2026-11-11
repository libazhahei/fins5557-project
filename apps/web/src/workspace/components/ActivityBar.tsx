import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ActivityMode } from "../types";

type Props = {
  activity: ActivityMode;
  onChange: (mode: ActivityMode) => void;
  dataSourceLabel: string;
};

export function ActivityBar({ activity, onChange, dataSourceLabel }: Props) {
  const { t, i18n } = useTranslation();
  const items: { id: ActivityMode; label: string; icon: string }[] = [
    { id: "market", label: t("workspace.activityMarket"), icon: "◎" },
    { id: "lab", label: t("workspace.activityLab"), icon: "⚗" },
    { id: "diff", label: t("workspace.activityDiff"), icon: "⇄" },
  ];

  return (
    <nav
      aria-label="Activity"
      className="flex h-full w-12 shrink-0 flex-col items-center border-r border-zinc-200 bg-zinc-100 py-2"
    >
      <div className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-current={activity === item.id ? "page" : undefined}
            className={`flex h-10 w-10 flex-col items-center justify-center rounded text-[10px] ${
              activity === item.id
                ? "bg-blue-600 text-white"
                : "text-zinc-600 hover:bg-zinc-200"
            }`}
            onClick={() => onChange(item.id)}
          >
            <span className="text-sm leading-none">{item.icon}</span>
            <span className="mt-0.5 max-w-[40px] truncate">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 pb-1">
        <button
          type="button"
          className="rounded border border-zinc-300 px-1 text-[9px] text-zinc-600"
          onClick={() => i18n.changeLanguage(i18n.language.startsWith("zh") ? "en" : "zh-CN")}
        >
          {i18n.language.startsWith("zh") ? "EN" : "中文"}
        </button>
        <span
          className="rounded px-1 text-[8px] text-zinc-500"
          title={dataSourceLabel}
        >
          {dataSourceLabel}
        </span>
        <Link
          to="/settings"
          className="rounded px-1 text-[9px] text-zinc-600 hover:text-blue-700"
        >
          {t("common.settings")}
        </Link>
      </div>
    </nav>
  );
}
