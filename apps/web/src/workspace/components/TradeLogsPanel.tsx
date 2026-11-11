import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ChartTradeLogMarker } from "../types";

type Props = {
  logs: ChartTradeLogMarker[];
  selectedId?: string | null;
  onSelect: (id: string, log: ChartTradeLogMarker) => void;
};

export function TradeLogsPanel({ logs, selectedId, onSelect }: Props) {
  const { t } = useTranslation();
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current[selectedId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  if (!logs.length) {
    return <p className="text-[11px] text-zinc-500">{t("workspace.noTradeLogs")}</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-[10px]">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            <th className="py-0.5">Date</th>
            <th>Sym</th>
            <th>Act</th>
            <th>Δw</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((m) => (
            <tr
              key={m.id}
              ref={(el) => {
                rowRefs.current[m.id] = el;
              }}
              className={`cursor-pointer border-b border-zinc-100 ${
                selectedId === m.id ? "bg-blue-50" : "hover:bg-zinc-50"
              }`}
              onClick={() => onSelect(m.id, m)}
            >
              <td className="py-0.5">{m.timestamp.slice(2)}</td>
              <td>{m.symbol}</td>
              <td>{m.action}</td>
              <td>
                {(m.weight_before * 100).toFixed(0)}%→{(m.weight_after * 100).toFixed(0)}%
              </td>
              <td className="max-w-[120px] truncate" title={m.reason_detail}>
                {m.reason_short}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
