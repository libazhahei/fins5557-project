# ChartWorkspace

Reusable center-chart shell used by Market and Lab (`apps/web/src/workspace/components/ChartWorkspace.tsx`).

## Features flags

```ts
type ChartFeatures = {
  timeframe?: boolean;      // 日K | 周K
  drawing?: boolean;        // top-right DrawingToolbar
  indicators?: boolean;     // compact IndicatorToolbar + More
  subPanes?: boolean;       // placement overlay|pane toggles
  legend?: boolean;         // OHLC + overlay values
  volumeProfile?: boolean;  // side VP when `vp` enabled
};
```

Market and Lab currently pass `DEFAULT_CHART_FEATURES` (all on). Future pages enable a subset.

## Placement

- Catalog field `defaultPlacement`: `overlay` | `pane` | `side` (`vp` defaults to side).
- UI overrides remap WASM `SeriesOut.pane` via `applyPlacementToResult` before `KlineChartCanvas` draws.
- Most indicators toggle **Main / Sub** (overlay ↔ pane). **Vol Profile** toggles **Side / Sub** (side strip ↔ bottom pane strip).
- Closing a sub-pane = turning the indicator off (`onToggle`).

## Timeframe

- Bars from API remain daily.
- Weekly = client `resampleBarsToWeekly` (ISO week, Mon UTC).
- Page keeps `chartTimeframe` and re-runs `useIndicatorEngine.compute` on resampled bars so series timestamps match the chart.

## Volume Profile window

When `vp` is enabled, the indicator toolbar shows a window control next to Vol Profile:

- **Visible** (default) — bars in the chart’s current visible range (`onVisibleRangeChange`), recomputed ~200ms after pan/zoom
- **120 / 30 / 7** — last N bars of the **current timeframe** (daily ≈ days, weekly ≈ weeks)
- Narrow toolbars collapse to a single `VP: …` chip that opens the same four options
- Session-only; refresh resets to Visible
- `ChartWorkspace` resolves `{ fromIdx, toIdx }` via `lib/vpWindow.ts` and pushes it to the page for `indicators.compute({ view })`

## Pred / Logs (Step 2 closeout)

- Pred ON: wasm ARIMA band on main; HV/EWMA (or M8) on volatility sub-pane; optional regime tint.
- Logs ON: BUY/SELL markers on candle time/price; click ↔ Trade Log table selection/scroll.
- Geometry helpers: `lib/predictionOverlayRender.ts` (SVG paths via `convertToPixel`).

## Related files

- `DrawingToolbar.tsx` — Trend / Fib / Rect / Horiz / Clear
- `IndicatorToolbar.tsx` — pinned BOLL/SMA/EMA/VOL/RSI/MACD + More + VP window
- `lib/indicatorPlacement.ts`, `lib/resampleBars.ts`, `lib/vpWindow.ts`, `lib/predictionOverlayRender.ts`
