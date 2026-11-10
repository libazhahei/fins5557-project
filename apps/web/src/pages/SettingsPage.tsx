import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  getLlmKey,
  getLlmProvider,
  getUniverse,
  setLlmKey,
  setLlmProvider,
  setUniverse,
  type Ready,
} from "../api";
import { AppShell } from "../components/Shell";

export function SettingsPage() {
  const { t } = useTranslation();
  const ready = useQuery({ queryKey: ["ready"], queryFn: () => api<Ready>("/ready") });
  const [key, setKey] = useState(getLlmKey());
  const [provider, setProvider] = useState(getLlmProvider());
  const [universe, setUniverseText] = useState(getUniverse().join(", "));
  const [saved, setSaved] = useState(false);
  const [liveYahoo, setLiveYahoo] = useState(false);

  function save() {
    setLlmKey(key.trim());
    setLlmProvider(provider);
    setUniverse(
      universe
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    );
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AppShell>
      <div className="grid h-full gap-2 overflow-auto p-3 md:grid-cols-3">
        <section className="rounded border border-zinc-200 bg-white p-2">
          <h2 className="mb-2 text-[12px] font-semibold">{t("settings.dataSource")}</h2>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="radio" checked={!liveYahoo} onChange={() => setLiveYahoo(false)} />
            {t("settings.fixtureActive")}
            {ready.data?.data_source?.fixture_ok ? " ✓" : ""}
          </label>
          <label className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
            <input type="radio" checked={liveYahoo} onChange={() => setLiveYahoo(true)} disabled />
            {t("settings.liveYahoo")}
          </label>
        </section>

        <section className="rounded border border-zinc-200 bg-white p-2">
          <h2 className="mb-2 text-[12px] font-semibold">{t("settings.universe")}</h2>
          <input
            className="h-8 w-full rounded border border-zinc-300 px-2 text-[11px]"
            value={universe}
            onChange={(e) => setUniverseText(e.target.value)}
          />
        </section>

        <section className="rounded border border-zinc-200 bg-white p-2">
          <h2 className="mb-2 text-[12px] font-semibold">{t("settings.llmKey")}</h2>
          <label className="mb-1 block text-[10px] text-zinc-500">{t("settings.llmProvider")}</label>
          <select
            className="mb-2 h-8 w-full rounded border border-zinc-300 px-2 text-[11px]"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="google">google</option>
            <option value="deepseek">deepseek</option>
          </select>
          <input
            type="password"
            className="h-8 w-full rounded border border-zinc-300 px-2 text-[11px]"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-…"
          />
          <button
            type="button"
            className="mt-2 h-8 w-full rounded bg-blue-600 text-[11px] text-white"
            onClick={save}
          >
            {t("settings.saveLocal")}
          </button>
          {saved && <p className="mt-1 text-[10px] text-emerald-700">{t("settings.saved")}</p>}
        </section>
      </div>
    </AppShell>
  );
}
