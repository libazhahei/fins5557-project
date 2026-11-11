import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getToken, type Narrative } from "../../api";
import type { IndicatorResult } from "../../wasm/types";
import type { ChartTradeLogMarker, RightTab, TickerOverview } from "../types";
import { AiReportPanel } from "./AiReportPanel";
import type { CandleBar } from "./KlineChartCanvas";
import { RunDiffPanel } from "./RunDiffPanel";
import { TickerInfoPanel } from "./TickerInfoPanel";
import { TradeLogsPanel } from "./TradeLogsPanel";

type Props = {
  tab: RightTab;
  onTab: (tab: RightTab) => void;
  overview?: TickerOverview | null;
  overviewLoading?: boolean;
  onAddToStrategy?: (symbol: string) => void;
  wasmScalars?: Record<string, number | null | undefined> | null;
  bars?: CandleBar[];
  indicatorResult?: IndicatorResult | null;
  tradeLogs: ChartTradeLogMarker[];
  selectedLogId?: string | null;
  onSelectLog: (id: string, log: ChartTradeLogMarker) => void;
  narrative?: Narrative | null;
  onAiAction: (patch: Record<string, unknown>) => void;
  compareIds: string[];
  chatLog: { role: string; text: string }[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendChat: () => void;
};

export function RightInspector({
  tab,
  onTab,
  overview,
  overviewLoading,
  onAddToStrategy,
  wasmScalars,
  bars,
  indicatorResult,
  tradeLogs,
  selectedLogId,
  onSelectLog,
  narrative,
  onAiAction,
  compareIds,
  chatLog,
  chatInput,
  setChatInput,
  onSendChat,
}: Props) {
  const { t } = useTranslation();
  const tabs: { id: RightTab; label: string }[] = [
    { id: "ticker", label: t("workspace.tabTicker") },
    { id: "trades", label: t("workspace.tabTrades") },
    { id: "ai", label: t("workspace.tabAi") },
    { id: "diff", label: t("workspace.tabDiff") },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col gap-1 overflow-hidden border-l border-zinc-200 bg-white p-1.5">
      <div className="flex flex-wrap gap-1 text-[10px]" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`rounded px-1.5 py-0.5 ${
              tab === item.id ? "bg-zinc-900 text-white" : "border border-zinc-300"
            }`}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto text-[11px]" role="tabpanel">
        {tab === "ticker" && (
          <TickerInfoPanel
            overview={overview}
            loading={overviewLoading}
            onAddToStrategy={onAddToStrategy}
            wasmScalars={wasmScalars}
            bars={bars}
            indicatorResult={indicatorResult}
          />
        )}
        {tab === "trades" && (
          <TradeLogsPanel logs={tradeLogs} selectedId={selectedLogId} onSelect={onSelectLog} />
        )}
        {tab === "ai" && <AiReportPanel narrative={narrative} onAction={onAiAction} />}
        {tab === "diff" && <RunDiffPanel compareIds={compareIds} />}
      </div>

      <div className="flex h-36 shrink-0 flex-col rounded border border-zinc-200">
        <div className="border-b border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
          Agent · Gemini
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1 text-[10px]">
          {!getToken() && (
            <p className="text-zinc-500">
              {t("workspace.chatLogin")} —{" "}
              <Link className="text-blue-700" to="/login?next=/workspace">
                {t("common.login")}
              </Link>
            </p>
          )}
          {chatLog.map((m, i) => (
            <div key={i} className="mb-1">
              <strong>{m.role === "user" ? ">" : "Lab"}</strong> {m.text}
            </div>
          ))}
        </div>
        <div className="flex gap-1 border-t border-zinc-200 p-1">
          <input
            className="h-7 min-w-0 flex-1 rounded border border-zinc-300 px-1 text-[10px]"
            value={chatInput}
            placeholder={t("workspace.chatPlaceholder")}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSendChat()}
          />
          <button
            type="button"
            className="rounded bg-blue-600 px-2 text-[10px] text-white"
            onClick={onSendChat}
          >
            {t("common.send")}
          </button>
        </div>
      </div>
    </aside>
  );
}
