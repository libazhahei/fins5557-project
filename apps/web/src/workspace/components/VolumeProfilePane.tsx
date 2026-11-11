import type { VolumeProfileOut } from "../../wasm/types";

type Props = {
  profile?: VolumeProfileOut | null;
  /** side = right of candles; pane = sub-chart strip under the chart */
  layout?: "side" | "pane";
};

export function VolumeProfilePane({ profile, layout = "side" }: Props) {
  const isPane = layout === "pane";

  if (!profile || !profile.bins?.length) {
    return (
      <div
        className={
          isPane
            ? "flex h-20 w-full items-center justify-center border-t border-zinc-200 bg-zinc-50 text-[9px] text-zinc-400"
            : "flex h-full min-w-[72px] items-center justify-center border-l border-zinc-200 bg-zinc-50 px-1 text-[9px] text-zinc-400"
        }
      >
        VP
      </div>
    );
  }
  const max = Math.max(...profile.bins, 1);
  const { price_low: lo, price_high: hi, poc, vah, val } = profile;

  return (
    <div
      className={
        isPane
          ? "flex h-20 w-full shrink-0 flex-col border-t border-zinc-200 bg-zinc-50 px-1 py-1"
          : "flex h-full min-w-[88px] flex-col border-l border-zinc-200 bg-zinc-50 px-1 py-1"
      }
      data-testid="volume-profile-pane"
      data-layout={layout}
      title={`POC ${poc ?? "—"} · VAH ${vah ?? "—"} · VAL ${val ?? "—"}`}
    >
      <div className="mb-0.5 flex items-center justify-between text-[9px] font-semibold text-zinc-600">
        <span>VP</span>
        {isPane && (
          <span className="font-normal text-zinc-400">
            L {lo.toFixed(1)} · POC {poc != null ? poc.toFixed(1) : "—"} · H {hi.toFixed(1)}
          </span>
        )}
      </div>
      <div
        className={
          isPane
            ? "flex min-h-0 flex-1 flex-row items-end gap-px"
            : "flex min-h-0 flex-1 flex-col-reverse gap-px"
        }
      >
        {profile.bins.map((bin, i) => {
          const price = lo + ((hi - lo) * (i + 0.5)) / profile.bins.length;
          const isPoc = poc != null && Math.abs(price - poc) <= (hi - lo) / profile.bins.length;
          const inVa =
            vah != null && val != null && price <= Math.max(vah, val) && price >= Math.min(vah, val);
          const fill = `${Math.max(4, (bin / max) * 100)}%`;
          return (
            <div
              key={i}
              className={
                isPane
                  ? "flex h-full min-w-0 flex-1 items-end"
                  : "flex items-center gap-0.5"
              }
              style={isPane ? undefined : { height: `${100 / profile.bins.length}%` }}
            >
              <div
                className={`rounded-sm ${isPoc ? "bg-blue-600" : inVa ? "bg-blue-300" : "bg-zinc-300"} ${
                  isPane ? "w-full" : "h-full"
                }`}
                style={isPane ? { height: fill } : { width: fill }}
              />
            </div>
          );
        })}
      </div>
      {!isPane && (
        <div className="mt-1 space-y-0.5 text-[8px] leading-tight text-zinc-500">
          <div>H {hi.toFixed(1)}</div>
          {poc != null && <div>POC {poc.toFixed(1)}</div>}
          <div>L {lo.toFixed(1)}</div>
        </div>
      )}
    </div>
  );
}
