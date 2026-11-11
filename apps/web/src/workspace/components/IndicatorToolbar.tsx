import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  INDICATOR_CATALOG,
  type IndicatorGroup,
  type IndicatorId,
  type IndicatorPlacement,
} from "../../wasm/types";
import { resolvePlacement } from "../lib/indicatorPlacement";
import { VP_WINDOW_MODES, type VpWindowMode } from "../lib/vpWindow";

type Props = {
  enabled: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
  placements?: Partial<Record<IndicatorId, IndicatorPlacement>>;
  onPlacementChange?: (id: IndicatorId, placement: IndicatorPlacement) => void;
  compact?: boolean;
  showPlacement?: boolean;
  vpWindowMode?: VpWindowMode;
  onVpWindowModeChange?: (mode: VpWindowMode) => void;
  showVpWindow?: boolean;
};

const GROUPS: { id: IndicatorGroup; title: string }[] = [
  { id: "low", title: "初级" },
  { id: "mid", title: "中级" },
  { id: "high", title: "高级" },
];

const PINNED: IndicatorId[] = ["boll", "sma", "ema", "vol", "rsi", "macd"];
const VP_COLLAPSE_WIDTH = 520;

function Chip({
  id,
  label,
  on,
  placement,
  showPlacement,
  onToggle,
  onPlacementChange,
}: {
  id: IndicatorId;
  label: string;
  on: boolean;
  placement: IndicatorPlacement;
  showPlacement?: boolean;
  onToggle: (id: IndicatorId) => void;
  onPlacementChange?: (id: IndicatorId, placement: IndicatorPlacement) => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        aria-pressed={on}
        className={`rounded px-1.5 py-0.5 ${
          on ? "bg-blue-600 text-white" : "border border-zinc-300 text-zinc-700"
        }`}
        onClick={() => onToggle(id)}
      >
        {label}
      </button>
      {on && showPlacement && onPlacementChange && (
        <button
          type="button"
          className="rounded border border-zinc-300 px-1 py-0.5 text-[9px] text-zinc-600"
          title={
            placement === "side" || id === "vp"
              ? t("workspace.placementSideToggle", {
                  defaultValue: "切换侧面 / 副图",
                })
              : t("workspace.placementToggle")
          }
          onClick={() => {
            if (id === "vp" || placement === "side") {
              onPlacementChange(id, placement === "side" ? "pane" : "side");
              return;
            }
            onPlacementChange(id, placement === "overlay" ? "pane" : "overlay");
          }}
        >
          {id === "vp" || placement === "side"
            ? placement === "side"
              ? t("workspace.placementSideShort", { defaultValue: "侧" })
              : t("workspace.placementPaneShort", { defaultValue: "副" })
            : placement === "overlay"
              ? t("workspace.placementOverlayShort", { defaultValue: "主" })
              : t("workspace.placementPaneShort", { defaultValue: "副" })}
        </button>
      )}
    </span>
  );
}

function VpWindowControls({
  mode,
  onChange,
  collapsed,
}: {
  mode: VpWindowMode;
  onChange: (mode: VpWindowMode) => void;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const labelFor = (m: VpWindowMode) =>
    m === "visible"
      ? t("workspace.vpWindowVisible", { defaultValue: "Visible" })
      : String(m);

  if (collapsed) {
    return (
      <span className="relative inline-flex items-center">
        <button
          type="button"
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-zinc-700"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          title={t("workspace.vpWindowTitle", { defaultValue: "VP window" })}
        >
          VP: {labelFor(mode)}
        </button>
        {open && (
          <div
            className="absolute bottom-full left-0 z-40 mb-1 flex flex-col rounded border border-zinc-200 bg-white p-1 shadow-md"
            role="listbox"
          >
            {VP_WINDOW_MODES.map((m) => (
              <button
                key={String(m)}
                type="button"
                role="option"
                aria-selected={mode === m}
                className={`rounded px-2 py-0.5 text-left ${
                  mode === m ? "bg-blue-600 text-white" : "text-zinc-700 hover:bg-zinc-100"
                }`}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
              >
                {labelFor(m)}
              </button>
            ))}
          </div>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded border border-zinc-200 bg-zinc-50 px-0.5 py-0.5"
      role="group"
      aria-label={t("workspace.vpWindowTitle", { defaultValue: "VP window" })}
    >
      {VP_WINDOW_MODES.map((m) => (
        <button
          key={String(m)}
          type="button"
          aria-pressed={mode === m}
          className={`rounded px-1.5 py-0.5 ${
            mode === m ? "bg-blue-600 text-white" : "text-zinc-700"
          }`}
          onClick={() => onChange(m)}
        >
          {labelFor(m)}
        </button>
      ))}
    </span>
  );
}

export function IndicatorToolbar({
  enabled,
  onToggle,
  placements,
  onPlacementChange,
  compact = true,
  showPlacement = true,
  vpWindowMode = "visible",
  onVpWindowModeChange,
  showVpWindow = false,
}: Props) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsedVp, setCollapsedVp] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const enabledSet = useMemo(() => new Set(enabled), [enabled]);

  const pinnedVisible = useMemo(() => {
    const pinned = PINNED.map((id) => INDICATOR_CATALOG.find((m) => m.id === id)!).filter(
      Boolean,
    );
    const extras = INDICATOR_CATALOG.filter(
      (m) => enabledSet.has(m.id) && !PINNED.includes(m.id),
    );
    return [...pinned, ...extras];
  }, [enabledSet]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || !showVpWindow) {
      setCollapsedVp(false);
      return;
    }
    const measure = () => {
      const w = el.clientWidth;
      // Width 0 (e.g. jsdom / not laid out) → keep expanded chips.
      setCollapsedVp(w > 0 && w < VP_COLLAPSE_WIDTH);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showVpWindow, pinnedVisible.length]);

  const vpControls =
    showVpWindow && onVpWindowModeChange ? (
      <VpWindowControls
        mode={vpWindowMode}
        onChange={onVpWindowModeChange}
        collapsed={collapsedVp}
      />
    ) : null;

  if (!compact) {
    return (
      <div className="flex max-h-24 flex-col gap-1 overflow-y-auto rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px]">
        {GROUPS.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-1">
            <span className="mr-1 shrink-0 font-semibold text-zinc-500">{g.title}</span>
            {INDICATOR_CATALOG.filter((m) => m.group === g.id).map((m) => (
              <Chip
                key={m.id}
                id={m.id}
                label={m.label}
                on={enabledSet.has(m.id)}
                placement={resolvePlacement(m.id, placements)}
                showPlacement={showPlacement}
                onToggle={onToggle}
                onPlacementChange={onPlacementChange}
              />
            ))}
          </div>
        ))}
        {vpControls}
      </div>
    );
  }

  return (
    <div className="relative z-20 overflow-visible rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px]">
      <div ref={rowRef} className="flex flex-wrap items-center gap-1">
        {pinnedVisible.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-0.5">
            <Chip
              id={m.id}
              label={m.label}
              on={enabledSet.has(m.id)}
              placement={resolvePlacement(m.id, placements)}
              showPlacement={showPlacement}
              onToggle={onToggle}
              onPlacementChange={onPlacementChange}
            />
            {m.id === "vp" && vpControls}
          </span>
        ))}
        <button
          type="button"
          className={`rounded px-1.5 py-0.5 ${
            moreOpen ? "bg-zinc-800 text-white" : "border border-zinc-300 text-zinc-700"
          }`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          {t("workspace.indicatorsMore", { defaultValue: "More" })}
        </button>
      </div>
      {moreOpen && (
        <div className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-48 overflow-y-auto rounded border border-zinc-200 bg-zinc-50 p-1 shadow-md">
          {GROUPS.map((g) => (
            <div key={g.id} className="mb-1 flex flex-wrap items-center gap-1">
              <span className="mr-1 shrink-0 font-semibold text-zinc-500">{g.title}</span>
              {INDICATOR_CATALOG.filter((m) => m.group === g.id).map((m) => (
                <Chip
                  key={m.id}
                  id={m.id}
                  label={m.label}
                  on={enabledSet.has(m.id)}
                  placement={resolvePlacement(m.id, placements)}
                  showPlacement={showPlacement}
                  onToggle={onToggle}
                  onPlacementChange={onPlacementChange}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
