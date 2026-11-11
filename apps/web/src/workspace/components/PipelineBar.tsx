type Step = {
  module_id: string;
  name: string;
  status: string;
  duration_ms: number;
  io_summary?: string;
};

export function PipelineBar({ steps }: { steps: Step[] }) {
  const defaults = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"];
  const byId = Object.fromEntries(steps.map((s) => [s.module_id, s]));
  return (
    <div className="flex h-8 items-center gap-1 overflow-x-auto rounded border border-zinc-200 bg-white px-1 text-[9px]">
      {defaults.map((id, i) => {
        const s = byId[id];
        const status = s?.status || "placeholder";
        const done = status === "completed";
        const stub =
          status === "placeholder" ||
          status === "not_implemented_in_step1" ||
          status === "skipped";
        return (
          <span key={id} className="inline-flex items-center gap-1">
            <span
              title={s ? `${s.name} · ${s.io_summary || ""}` : id}
              className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 ${
                done
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : stub
                    ? "border-dashed border-zinc-400 text-zinc-500"
                    : "border-zinc-300"
              }`}
            >
              {done ? "OK" : stub ? "…" : "·"} {id}
              {done && s ? ` ${s.duration_ms}ms` : ""}
            </span>
            {i < defaults.length - 1 && <span className="text-zinc-300">→</span>}
          </span>
        );
      })}
    </div>
  );
}
