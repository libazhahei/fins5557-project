import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import type { TickerOverview, WatchlistGroup } from "../types";

type Props = {
  selectedSymbol: string;
  runSymbols?: string[];
  onSelect: (symbol: string) => void;
};

type SearchHit = { symbol: string; name: string; asset_type: string };

function QuoteRow({
  symbol,
  selected,
  overview,
  onSelect,
}: {
  symbol: string;
  selected: boolean;
  overview?: TickerOverview;
  onSelect: (symbol: string) => void;
}) {
  const last = overview?.quote.last_price;
  const chg = overview?.quote.change_pct;
  const name = overview?.name;
  const up = chg != null && chg >= 0;
  return (
    <button
      type="button"
      className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-1 rounded border px-1.5 py-1 text-left text-[11px] ${
        selected
          ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
          : "border-zinc-200 hover:border-zinc-400"
      }`}
      onClick={() => onSelect(symbol)}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-zinc-900">
          {name || symbol}
        </span>
        <span className="block text-[9px] text-zinc-500">{symbol}</span>
      </span>
      <span
        className={`tabular-nums ${
          chg == null ? "text-zinc-400" : up ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {last == null || Number.isNaN(Number(last)) ? "—" : Number(last).toFixed(2)}
      </span>
      <span
        className={`min-w-[3.25rem] text-right tabular-nums ${
          chg == null ? "text-zinc-400" : up ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {chg == null || Number.isNaN(Number(chg))
          ? "—"
          : `${up ? "+" : ""}${(Number(chg) * 100).toFixed(2)}%`}
      </span>
    </button>
  );
}

export function WatchlistPanel({ selectedSymbol, runSymbols = [], onSelect }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => api<{ groups: WatchlistGroup[] }>("/market/watchlist"),
  });
  const search = useQuery({
    queryKey: ["market-search", q],
    enabled: q.trim().length >= 1,
    queryFn: () => api<{ results: SearchHit[] }>(`/market/search?q=${encodeURIComponent(q.trim())}`),
  });

  const groups = useMemo(() => {
    const base = watchlist.data?.groups || [];
    const withRun: WatchlistGroup[] = [
      {
        id: "current_run",
        title: t("workspace.currentRunUniverse"),
        symbols: runSymbols,
      },
      ...base,
    ];
    return withRun;
  }, [watchlist.data?.groups, runSymbols, t]);

  const allSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const s of g.symbols) set.add(s);
    return [...set];
  }, [groups]);

  const quoteQueries = useQueries({
    queries: allSymbols.map((sym) => ({
      queryKey: ["overview", sym],
      queryFn: () => api<TickerOverview>(`/market/tickers/${sym}/overview`),
      staleTime: 45_000,
    })),
  });

  const overviewBySym = useMemo(() => {
    const map = new Map<string, TickerOverview>();
    allSymbols.forEach((sym, i) => {
      const data = quoteQueries[i]?.data;
      if (data) map.set(sym, data);
    });
    return map;
  }, [allSymbols, quoteQueries]);

  return (
    <aside className="flex h-full flex-col gap-1.5 overflow-auto border-r border-zinc-200 bg-white p-1.5">
      <div className="text-[11px] font-semibold text-zinc-700">{t("workspace.watchlist")}</div>
      <input
        className="h-7 w-full rounded border border-zinc-300 px-1.5 text-[11px]"
        placeholder={t("workspace.searchTicker")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t("workspace.searchTicker")}
      />
      {q.trim() && (
        <ul className="rounded border border-zinc-200 bg-zinc-50 p-1 text-[10px]">
          {(search.data?.results || []).map((hit) => (
            <li key={hit.symbol}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-1 py-0.5 hover:bg-blue-50"
                onClick={() => onSelect(hit.symbol)}
              >
                <span className="font-semibold">{hit.symbol}</span>
                <span className="truncate text-zinc-500">{hit.name}</span>
              </button>
            </li>
          ))}
          {!search.isFetching && (search.data?.results || []).length === 0 && (
            <li className="px-1 text-zinc-500">{t("workspace.noResults")}</li>
          )}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] gap-1 px-1 text-[9px] font-semibold text-zinc-500">
        <span>{t("workspace.colNameCode")}</span>
        <span>{t("workspace.colLast")}</span>
        <span className="min-w-[3.25rem] text-right">{t("workspace.colChg")}</span>
      </div>
      {groups.map((g) => (
        <div key={g.id}>
          <div className="mt-1 text-[10px] font-semibold text-zinc-500">{g.title}</div>
          <ul className="flex flex-col gap-0.5">
            {g.symbols.map((sym) => (
              <li key={`${g.id}-${sym}`}>
                <QuoteRow
                  symbol={sym}
                  selected={selectedSymbol === sym}
                  overview={overviewBySym.get(sym)}
                  onSelect={onSelect}
                />
              </li>
            ))}
            {g.symbols.length === 0 && (
              <li className="px-1 text-[10px] text-zinc-400">—</li>
            )}
          </ul>
        </div>
      ))}
    </aside>
  );
}
