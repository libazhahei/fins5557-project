# WASM 看盘指标引擎

浏览器侧指标计算：初级 / 中级 / 高级 A 类。回测 KPI、重 M6、AI 仍在后端。

## 架构

- **Worker**：`apps/web/src/wasm/indicatorWorker.ts`
- **主引擎**：[`wickra-wasm`](https://www.npmjs.com/package/wickra-wasm)（MIT OR Apache-2.0）
- **缺口 crate**：`crates/quant-wasm` → `apps/web/src/wasm/pkg/`（`wasm-pack`）
- **UI**：`IndicatorToolbar`、`VolumeProfilePane`、`KlineChartCanvas` SVG 叠加

## 指标清单

| 层级 | 能力 | 来源 |
| --- | --- | --- |
| 初级 | SMA/EMA/WMA/MACD/BBI/SAR、RSI/KDJ/WR/CCI/BIAS、BOLL/ATR/VOL/OBV、HV | wickra-wasm |
| 中级 | VWAP±σ、Volume Profile、MFI/CMF、KAMA/SuperTrend/HMA/ALMA、Ichimoku、ADX、Keltner、Donchian | wickra-wasm |
| 高级 A | 谐波、Hilbert、Hurst、GARCH、RollingCorr、TD Wave | wickra-wasm |
| 高级 A | 缠论笔/段/中枢、SMC(FVG/BOS/CHoCH)、Kalman、轻量 MC 通道 | quant-wasm |
| Pred（轻量） | **ARIMA(1,1,0)** 主图价带；**HV/EWMA** 波动率副图 5d 线 | quant-wasm（Pred ON，无需 Run） |

## 开源参考（quant-wasm）

| 模块 | 参考 |
| --- | --- |
| Kalman | [QuantWave Kalman](https://lavs9.github.io/quantwave/guides/indicators/native/kalman_filter/) |
| SMC | [smart-money-concepts](https://github.com/joshyattridge/smart-money-concepts)、[pyvsmc](https://github.com/Khaymat/pyvsmc) |
| MC | 本仓 `packages/quant/.../montecarlo.py` `block_bootstrap_paths`；[mc-simulations](https://github.com/engan/mc-simulations) |
| ARIMA / HV | 手写 ARIMA(1,1,0) + EWMA HV（`arima.rs` / `hv_ewma.rs`）；研究 sketch，非实盘信号 |
| 缠论 | [chan.py](https://github.com/Vespa314/chan.py) 子集；crates.io `chanlun` 作对照（WASM 安全回退为本仓实现） |

## 重建 wasm

```bash
cd crates/quant-wasm
wasm-pack build --target web --out-dir ../../apps/web/src/wasm/pkg --release
cargo test -p quant-wasm
```

## Vite / wickra-wasm

`wickra-wasm` 是 wasm-bindgen **bundler** 目标（`import *.wasm`）。Vite 需启用 `vite-plugin-wasm` + `vite-plugin-top-level-await`（含 `worker.plugins`），且不要把 `*.wasm` 全量 `assetsInclude` 成静态 URL，否则会出现 `__wbindgen_add_to_stack_pointer is not a function`，指标全部算不出。

图表壳、placement、日/周重采样见 [`docs/chart-workspace.md`](chart-workspace.md)。

## 边界

- 图上轻量 MC（`model_source: wasm_mc`）≠ 后端 M6 权威摘要。
- 图上 ARIMA / HV/EWMA（`wasm_arima` / `wasm_hv_ewma`）是研究 sketch；后端 M8 RV 有数据时优先生效于波动率副图。
- 后端 M6 equity band 走 `target_pane: equity_chart`，**不**叠在价格 K 线（量级不同）。
- Footprint / CVD / Orderbook / 真 TPO：无 Tick/L2，不做。
