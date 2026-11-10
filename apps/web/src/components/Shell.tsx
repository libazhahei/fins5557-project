import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, getToken, setToken, type Ready } from "../api";
import { setSavedLang } from "../i18n";

export function LangToggle() {
  const { i18n, t } = useTranslation();
  return (
    <button
      type="button"
      className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:border-blue-600 hover:text-blue-700"
      onClick={() => {
        const next = i18n.language === "zh-CN" ? "en" : "zh-CN";
        void i18n.changeLanguage(next);
        setSavedLang(next);
      }}
    >
      {t("common.lang")}
    </button>
  );
}

export function AppShell({
  children,
  dense = false,
}: {
  children: ReactNode;
  dense?: boolean;
}) {
  const { t } = useTranslation();
  const loc = useLocation();
  const token = getToken();
  const ready = useQuery({
    queryKey: ["ready"],
    queryFn: () => api<Ready>("/ready"),
    staleTime: 30_000,
  });

  const nav = [
    { to: "/workspace", label: t("common.workspace") },
    { to: "/runs", label: t("common.runs") },
    { to: "/signals", label: t("common.signals"), badge: t("common.step4") },
    { to: "/settings", label: t("common.settings") },
  ];

  return (
    <div className={`flex h-dvh flex-col bg-zinc-50 text-zinc-900 ${dense ? "" : ""}`}>
      <header className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-100 px-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="shrink-0 text-[13px] font-semibold tracking-tight">
            {t("common.brand")}
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto text-[11px] text-zinc-600">
            {nav.map((item) => {
              const active = loc.pathname === item.to || loc.pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                    active ? "bg-zinc-900 text-zinc-50" : "hover:bg-zinc-200"
                  }`}
                >
                  {item.label}
                  {"badge" in item && item.badge ? (
                    <span className="rounded bg-zinc-500 px-1 text-[9px] text-white">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-zinc-600">
          <span className="hidden sm:inline">
            {t("common.fixture")}:{" "}
            {ready.data?.data_source?.fixture_ok ? t("common.offline") : "—"}
          </span>
          <span className="hidden md:inline">
            LLM: {ready.data?.llm?.primary ?? "…"} {t("common.ok")}
          </span>
          <Link
            to="/settings"
            className="rounded border border-zinc-300 px-2 py-0.5 hover:border-blue-600"
          >
            {t("common.apiKey")}
          </Link>
          <LangToggle />
          {token ? (
            <button
              type="button"
              className="rounded border border-zinc-300 px-2 py-0.5 hover:border-red-600"
              onClick={() => {
                setToken(null);
                location.href = "/";
              }}
            >
              {t("common.logout")}
            </button>
          ) : (
            <Link to="/login" className="rounded bg-blue-600 px-2 py-0.5 text-white">
              {t("common.login")}
            </Link>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      <footer className="flex h-5 shrink-0 items-center border-t border-zinc-200 bg-zinc-100 px-2 text-[10px] text-zinc-500">
        {t("common.disclaimer")}
      </footer>
    </div>
  );
}

export function MinimalShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <header className="flex h-10 items-center justify-between border-b border-zinc-200 px-4">
        <Link to="/" className="text-sm font-semibold">
          {t("common.brand")}
        </Link>
        <div className="flex items-center gap-2">
          <LangToggle />
          <Link to="/login" className="rounded bg-blue-600 px-3 py-1 text-xs text-white">
            {t("common.login")}
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-zinc-200 px-4 py-2 text-[10px] text-zinc-500">
        {t("common.disclaimer")}
      </footer>
    </div>
  );
}
