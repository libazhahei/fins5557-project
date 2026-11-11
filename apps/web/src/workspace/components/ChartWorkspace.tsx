import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  IndicatorId,
  IndicatorPlacement,
  IndicatorResult,
} from "../../wasm/types";
import { applyPlacementToResult, resolvePlacement } from "../lib/indicatorPlacement";
import { resampleBarsToWeekly } from "../lib/resampleBars";
import {
  resolveVpView,
  type VisibleBarRange,
  type VpView,
  type VpWindowMode,
} from "../lib/vpWindow";
import type { ChartTradeLogMarker, PredictionOverlay } from "../types";
import { DrawingToolbar } from "./DrawingToolbar";
import { IndicatorToolbar } from "./IndicatorToolbar";
import { KlineChartCanvas, type CandleBar } from "./KlineChartCanvas";

export type ChartTimeframe = "1d" | "1w";

export type ChartFeatures = {
  timeframe?: boolean;
  drawing?: boolean;
  indicators?: boolean;
  subPanes?: boolean;
  legend?: boolean;
  volumeProfile?: boolean;
};

export const DEFAULT_CHART_FEATURES: Required<ChartFeatures> = {
  timeframe: true,
  drawing: true,
  indicators: true,
  subPanes: true,
  legend: true,
  volumeProfile: true,
};

type Props = {
  symbol: string;
  bars: CandleBar[];
  features?: ChartFeatures;
  timeframe: ChartTimeframe;
  onTimeframeChange: (tf: ChartTimeframe) => void;
  enabled: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
  indicatorResult: IndicatorResult | null;
  tradeLogs?: ChartTradeLogMarker[];
  predictions?: PredictionOverlay[];
  showTradeLogs?: boolean;
  showPredictions?: boolean;
  selectedLogId?: string | null;
  onSelectLog?: (id: string) => void;
  error?: string | null;
  onVpViewChange?: (view: VpView) => void;
};

const VP_VIEW_DEBOUNCE_MS = 200;

export function ChartWorkspace({
  symbol,
  bars,
  features: featuresProp,
  timeframe,
  onTimeframeChange,
  enabled,
  onToggle,
  indicatorResult,
  tradeLogs,
  predictions,
  showTradeLogs,
  showPredictions,
  selectedLogId,
  onSelectLog,
  error,
  onVpViewChange,
}: Props) {
  const { t } = useTranslation();
  const features = { ...DEFAULT_CHART_FEATURES, ...featuresProp };
  const [drawingTool, setDrawingTool] = useState<string | null>(null);
  const [placements, setPlacements] = useState<
    Partial<Record<IndicatorId, IndicatorPlacement>>
  >({});
  const [vpMode, setVpMode] = useState<VpWindowMode>("visible");
  const [visibleRange, setVisibleRange] = useState<VisibleBarRange | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastViewKey = useRef("");

  const displayBars = useMemo(
    () => (timeframe === "1w" ? resampleBarsToWeekly(bars) : bars),
    [bars, timeframe],
  );

  const remapped = useMemo(
    () => applyPlacementToResult(indicatorResult, placements),
    [indicatorResult, placements],
  );

  const vpPlacement = resolvePlacement("vp", placements);
  const showVp =
    features.volumeProfile && enabled.includes("vp") && Boolean(remapped?.profiles?.length);

  useEffect(() => {
    if (!onVpViewChange) return;
    const view = resolveVpView(displayBars.length, vpMode, visibleRange);
    const key = `${view.fromIdx}:${view.toIdx}`;
    if (key === lastViewKey.current) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastViewKey.current = key;
      onVpViewChange(view);
    }, VP_VIEW_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [displayBars.length, vpMode, visibleRange, onVpViewChange]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1">
      <div className="flex shrink-0 flex-wrap items-center gap-1 text-[10px]">
        {features.timeframe && (
          <div className="inline-flex rounded border border-zinc-300" role="group">
            <button
              type="button"
              className={`px-1.5 py-0.5 ${
                timeframe === "1d" ? "bg-zinc-900 text-white" : "text-zinc-700"
              }`}
              aria-pressed={timeframe === "1d"}
              onClick={() => onTimeframeChange("1d")}
            >
              {t("workspace.tfDaily", { defaultValue: "日K" })}
            </button>
            <button
              type="button"
              className={`px-1.5 py-0.5 ${
                timeframe === "1w" ? "bg-zinc-900 text-white" : "text-zinc-700"
              }`}
              aria-pressed={timeframe === "1w"}
              onClick={() => onTimeframeChange("1w")}
            >
              {t("workspace.tfWeekly", { defaultValue: "周K" })}
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1" />
        {features.drawing && (
          <DrawingToolbar tool={drawingTool} onChange={setDrawingTool} />
        )}
        {error && (
          <span className="text-red-600" title={error}>
            WASM err
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded border border-zinc-200 bg-white p-1">
        {displayBars.length ? (
          <KlineChartCanvas
            symbol={symbol}
            bars={displayBars}
            tradeLogs={tradeLogs}
            predictions={predictions}
            showTradeLogs={showTradeLogs}
            showPredictions={showPredictions}
            selectedLogId={selectedLogId}
            drawingTool={features.drawing ? drawingTool : null}
            indicatorResult={remapped}
            showLegend={features.legend}
            showVolumeProfile={showVp}
            volumeProfileLayout={vpPlacement === "pane" ? "pane" : "side"}
            onSelectLog={onSelectLog}
            onVisibleRangeChange={setVisibleRange}
          />
        ) : (
          <p className="p-4 text-[11px] text-zinc-500">{t("workspace.emptyRun")}</p>
        )}
      </div>

      {features.indicators && (
        <div className="relative z-20 shrink-0 overflow-visible">
          <IndicatorToolbar
            enabled={enabled}
            onToggle={onToggle}
            placements={placements}
            onPlacementChange={
              features.subPanes
                ? (id, placement) =>
                    setPlacements((prev) => ({ ...prev, [id]: placement }))
                : undefined
            }
            showPlacement={features.subPanes}
            compact
            showVpWindow={features.volumeProfile && enabled.includes("vp")}
            vpWindowMode={vpMode}
            onVpWindowModeChange={setVpMode}
          />
        </div>
      )}
    </div>
  );
}
