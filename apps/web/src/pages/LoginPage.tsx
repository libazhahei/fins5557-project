import type { FormEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setToken } from "../api";
import { MinimalShell } from "../components/Shell";

export function LoginPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/workspace";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("quant-lab-invite");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { username, password }
          : { username, password, invite_code: invite };
      const data = await api<{ access_token: string }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(data.access_token);
      nav(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <MinimalShell>
      <section className="mx-auto mt-12 w-full max-w-sm rounded border border-zinc-200 bg-white p-4">
        <h1 className="mb-3 text-lg font-semibold">
          {mode === "login" ? t("auth.submitLogin") : t("auth.submitRegister")}
        </h1>
        <form className="flex flex-col gap-2" onSubmit={onSubmit}>
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-600">
            {t("auth.username")}
            <input
              className="h-8 rounded border border-zinc-300 px-2 text-xs"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-zinc-600">
            {t("auth.password")}
            <input
              type="password"
              className="h-8 rounded border border-zinc-300 px-2 text-xs"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {mode === "register" && (
            <label className="flex flex-col gap-0.5 text-[11px] text-zinc-600">
              {t("auth.invite")}
              <input
                className="h-8 rounded border border-zinc-300 px-2 text-xs"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                required
              />
            </label>
          )}
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <button type="submit" className="mt-1 h-8 rounded bg-blue-600 text-xs text-white">
            {mode === "login" ? t("auth.submitLogin") : t("auth.submitRegister")}
          </button>
        </form>
        <button
          type="button"
          className="mt-3 text-[11px] text-blue-700"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}
        </button>
      </section>
    </MinimalShell>
  );
}
