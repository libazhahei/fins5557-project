import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MinimalShell } from "../components/Shell";

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <MinimalShell>
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t("common.brand")}</p>
        <h1 className="text-3xl font-semibold leading-tight text-zinc-900 sm:text-4xl">
          {t("landing.title")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">{t("landing.lede")}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/workspace"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("landing.ctaWorkspace")}
          </Link>
          <Link
            to="/login"
            className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:border-blue-600"
          >
            {t("landing.ctaLogin")}
          </Link>
        </div>
      </section>
    </MinimalShell>
  );
}
