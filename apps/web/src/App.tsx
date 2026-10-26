import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, getToken, setToken, type Health } from "./api";
import { ChartPanel, type Candle, type EquityPoint } from "./ChartPanel";

function Shell({ children }: { children: ReactNode }) {
  const token = getToken();
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">
          Quant Lab
        </Link>
        <nav>
          <Link to="/">实验室</Link>
          <Link to="/charts">图表</Link>
          <Link to="/runs">实验记录</Link>
          <Link to="/pipeline">流水线</Link>
          <Link to="/settings">设置</Link>
          {token ? (
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setToken(null);
                location.href = "/login";
              }}
            >
              退出
            </button>
          ) : (
            <Link to="/login">登录</Link>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="foot">仅供研究，不构成投资建议。历史回测结果不代表未来表现。</footer>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginPage() {
  const nav = useNavigate();
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
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Shell>
      <section className="hero narrow">
        <h1>{mode === "login" ? "登录" : "注册"}</h1>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            用户名
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {mode === "register" && (
            <label>
              邀请码
              <input value={invite} onChange={(e) => setInvite(e.target.value)} required />
            </label>
          )}
          {error && <p className="err">{error}</p>}
          <button type="submit" className="primary enabled">
            {mode === "login" ? "登录" : "注册并进入"}
          </button>
        </form>
        <button type="button" className="linkish" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </section>
    </Shell>
  );
}

function LabHome() {
  const qc = useQueryClient();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api<Health>("/health"),
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api<{ templates: { id: string; name: string }[] }>("/runs/templates"),
  });
  const runMut = useMutation({
    mutationFn: (template: string) =>
      api("/runs/from-template", {
        method: "POST",
        body: JSON.stringify({ template, use_fixtures: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [provider, setProvider] = useState("google");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function ensureSession() {
    if (sessionId) return sessionId;
    const s = await api<{ id: string }>("/agent/sessions", {
      method: "POST",
      body: JSON.stringify({ provider }),
    });
    setSessionId(s.id);
    return s.id;
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    setBusy(true);
    const msg = chatInput.trim();
    setChatInput("");
    setChatLog((l) => [...l, { role: "user", text: msg }]);
    try {
      const sid = await ensureSession();
      const res = await api<{ text: string }>(`/agent/sessions/${sid}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: msg, provider }),
      });
      setChatLog((l) => [...l, { role: "assistant", text: res.text }]);
      void qc.invalidateQueries({ queryKey: ["runs"] });
    } catch (e) {
      setChatLog((l) => [
        ...l,
        { role: "assistant", text: e instanceof Error ? e.message : String(e) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <section className="hero">
        <h1>实验室</h1>
        <p className="lede">用自然语言或模板提出想法，拆成可回测步骤，再用图表解读。</p>

        <div className="templates">
          {(templates.data?.templates || []).map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === "trend_vt" ? "primary enabled" : "enabled"}
              disabled={runMut.isPending}
              onClick={() => runMut.mutate(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        {runMut.isSuccess && (
          <p className="ok">回测完成 — 打开「实验记录」或「图表」查看。</p>
        )}
        {runMut.isError && <p className="err">{(runMut.error as Error).message}</p>}

        <div className="lab-grid">
          <div className="chat panel">
            <div className="panel-head">
              <h2>对话</h2>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="google">Gemini</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
            <div className="chat-log" data-testid="chat-log">
              {chatLog.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  <strong>{m.role === "user" ? "你" : "Lab"}</strong>
                  <pre>{m.text}</pre>
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="例如：帮我跑趋势+波动目标回测"
                onKeyDown={(e) => e.key === "Enter" && void sendChat()}
              />
              <button type="button" className="primary enabled" disabled={busy} onClick={() => void sendChat()}>
                发送
              </button>
            </div>
          </div>
          <div className="status-card panel">
            <h2>API / 模型</h2>
            {health.isLoading && <p>检查健康…</p>}
            {health.error && <p className="err">无法连接 api</p>}
            {health.data && (
              <ul>
                <li>
                  {health.data.status} · 主 {health.data.models?.primary}
                </li>
                <li>
                  lite {health.data.models?.lite}（test / compact）
                </li>
                <li>DeepSeek {health.data.models?.deepseek_model}</li>
              </ul>
            )}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function ChartsPage() {
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<{ runs: any[] }>("/runs"),
  });
  const latest = runs.data?.runs?.[0];
  const [symbol, setSymbol] = useState("SPY");

  const bars = useQuery({
    queryKey: ["bars", symbol, latest?.panel_uri],
    enabled: Boolean(getToken()),
    queryFn: () => {
      const q = new URLSearchParams({ symbol, limit: "500" });
      if (latest?.panel_uri) q.set("panel_uri", latest.panel_uri);
      return api<{ bars: Candle[] }>(`/bars?${q}`);
    },
  });

  const overlays = useQuery({
    queryKey: ["overlays", latest?.id],
    enabled: Boolean(latest?.id),
    queryFn: () => api<{ equity: EquityPoint[]; summary: any }>(`/runs/${latest.id}/overlays`),
  });

  const symbols = useMemo(
    () => latest?.params?.tickers || ["SPY", "QQQ", "IEF", "TLT", "GLD"],
    [latest],
  );

  return (
    <Shell>
      <section className="hero wide">
        <h1>图表</h1>
        <p className="lede">K 线 + 权益曲线联动（K2）。选择标的查看最近一次实验。</p>
        <div className="templates">
          {symbols.map((s: string) => (
            <button
              key={s}
              type="button"
              className={s === symbol ? "primary enabled" : "enabled"}
              onClick={() => setSymbol(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {bars.data?.bars?.length ? (
          <ChartPanel
            symbol={symbol}
            candles={bars.data.bars}
            equity={overlays.data?.equity}
          />
        ) : (
          <p className="hint">暂无数据 — 先在实验室跑一个模板。</p>
        )}
        {overlays.data?.summary && (
          <pre className="metrics">{JSON.stringify(overlays.data.summary, null, 2)}</pre>
        )}
      </section>
    </Shell>
  );
}

function RunsPage() {
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<{ runs: any[] }>("/runs"),
  });
  return (
    <Shell>
      <section className="hero">
        <h1>实验记录</h1>
        <div className="run-list">
          {(runs.data?.runs || []).map((r) => (
            <article key={r.id} className="run-card">
              <h3>{r.name}</h3>
              <p>
                {r.status} · {r.template} · {r.created_at}
              </p>
              <pre>{JSON.stringify(r.summary, null, 2)}</pre>
            </article>
          ))}
          {!runs.data?.runs?.length && <p className="hint">还没有实验。</p>}
        </div>
      </section>
    </Shell>
  );
}

function PipelinePage() {
  return (
    <Shell>
      <section className="hero">
        <h1>流水线</h1>
        <p className="lede">M1→M9 可组装步骤；对话与模板写入同一 Job 模型。</p>
        <ol className="pipe">
          <li>M1 data.fetch</li>
          <li>M2 indicators.compute</li>
          <li>M3 portfolio.optimize</li>
          <li>M4 rebalance.plan</li>
          <li>M5 backtest.run</li>
          <li>M6 montecarlo.run</li>
          <li>M7 signal.daily</li>
          <li>M8 rv.ml</li>
          <li>M9 report.build</li>
        </ol>
      </section>
    </Shell>
  );
}

function SettingsPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health") });
  return (
    <Shell>
      <section className="hero">
        <h1>设置</h1>
        <p className="lede">模型：Gemini 主模型 / lite compact；可选 DeepSeek（Pi / OpenAI 兼容）。</p>
        <pre className="metrics">{JSON.stringify(health.data?.models, null, 2)}</pre>
      </section>
    </Shell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <LabHome />
          </RequireAuth>
        }
      />
      <Route
        path="/charts"
        element={
          <RequireAuth>
            <ChartsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/runs"
        element={
          <RequireAuth>
            <RunsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/pipeline"
        element={
          <RequireAuth>
            <PipelinePage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
