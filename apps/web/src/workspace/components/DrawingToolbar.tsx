import { useTranslation } from "react-i18next";

export type DrawingToolId =
  | "trendLine"
  | "fibonacciLine"
  | "rect"
  | "horizontalStraightLine";

const TOOLS: { id: DrawingToolId; labelKey: string; fallback: string }[] = [
  { id: "trendLine", labelKey: "workspace.drawTrend", fallback: "Trend" },
  { id: "fibonacciLine", labelKey: "workspace.drawFib", fallback: "Fib" },
  { id: "rect", labelKey: "workspace.drawRect", fallback: "Rect" },
  {
    id: "horizontalStraightLine",
    labelKey: "workspace.drawHoriz",
    fallback: "Horiz",
  },
];

type Props = {
  tool: string | null;
  onChange: (tool: string | null) => void;
};

export function DrawingToolbar({ tool, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-wrap items-center gap-0.5"
      role="toolbar"
      aria-label={t("workspace.drawingTools")}
    >
      {TOOLS.map((item) => {
        const on = tool === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              on ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700"
            }`}
            onClick={() => onChange(on ? null : item.id)}
          >
            {t(item.labelKey, { defaultValue: item.fallback })}
          </button>
        );
      })}
      <button
        type="button"
        className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600"
        onClick={() => onChange(null)}
      >
        {t("workspace.drawClear", { defaultValue: "Clear" })}
      </button>
    </div>
  );
}
