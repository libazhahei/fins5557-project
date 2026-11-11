type Point = { value: number };

type Props = {
  title: string;
  values: Point[];
  kind?: "line" | "bars";
  height?: number;
};

/** Tiny SVG sparkline / volume bars for the ticker inspector. */
export function MiniSpark({ title, values, kind = "line", height = 40 }: Props) {
  const w = 220;
  const h = height;
  const pad = 2;
  const nums = values.map((v) => v.value).filter((n) => Number.isFinite(n));
  if (nums.length < 2) {
    return (
      <div className="rounded border border-zinc-200 p-1.5">
        <div className="mb-0.5 text-[10px] font-semibold text-zinc-600">{title}</div>
        <div className="text-[9px] text-zinc-400">—</div>
      </div>
    );
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const n = nums.length;

  if (kind === "bars") {
    const bw = Math.max(1, (w - pad * 2) / n - 0.5);
    return (
      <div className="rounded border border-zinc-200 p-1.5">
        <div className="mb-0.5 text-[10px] font-semibold text-zinc-600">{title}</div>
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="block h-10 w-full" aria-hidden>
          {nums.map((v, i) => {
            const barH = ((v - min) / span) * (h - pad * 2);
            const x = pad + i * ((w - pad * 2) / n);
            const y = h - pad - barH;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={bw}
                height={Math.max(1, barH)}
                className="fill-zinc-400"
              />
            );
          })}
        </svg>
      </div>
    );
  }

  const pts = nums
    .map((v, i) => {
      const x = pad + (i / (n - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded border border-zinc-200 p-1.5">
      <div className="mb-0.5 text-[10px] font-semibold text-zinc-600">{title}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="block h-10 w-full" aria-hidden>
        <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="1.25" />
      </svg>
    </div>
  );
}
