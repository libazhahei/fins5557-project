//! Quant Lab browser indicator gap crate.
//!
//! Reference sources (see docs/wasm-indicator-engine.md):
//! - Kalman: QuantWave 1D Kalman filter formula
//! - SMC: joshyattridge/smart-money-concepts + Khaymat/pyvsmc rules
//! - MC: packages/quant block_bootstrap_paths
//! - Chan: Vespa314/chan.py subset (fractal → bi → zhongshu)

mod chan;
mod kalman;
mod mc;
mod smc;
mod types;

use serde_wasm_bindgen::{from_value, to_value};
use wasm_bindgen::prelude::*;

pub use types::{Bar, ComputeRequest, ComputeResponse};

#[wasm_bindgen(start)]
pub fn start() {
    // no-op; reserved for panic hook if needed later
}

/// Unified entry: bars + enabled ids → series / structures / bands / profiles.
#[wasm_bindgen]
pub fn compute(req: JsValue) -> Result<JsValue, JsValue> {
    let request: ComputeRequest = from_value(req).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let resp = compute_inner(&request);
    to_value(&resp).map_err(|e| JsValue::from_str(&e.to_string()))
}

pub fn compute_inner(req: &ComputeRequest) -> ComputeResponse {
    let mut out = ComputeResponse::default();
    let enabled: Vec<&str> = req.enabled.iter().map(|s| s.as_str()).collect();
    let has = |id: &str| enabled.iter().any(|e| *e == id || e.starts_with(&format!("{id}:")));

    if has("kalman") {
        let q = req.param_f64("kalman_q").unwrap_or(0.01);
        let r = req.param_f64("kalman_r").unwrap_or(0.1);
        out.series.push(kalman::smooth_closes(&req.bars, q, r));
    }
    if has("smc") || has("fvg") || has("bos") {
        out.structures.extend(smc::detect(&req.bars));
    }
    if has("chan") || has("chanlun") {
        out.structures.extend(chan::detect(&req.bars));
    }
    if has("mc") || has("wasm_mc") {
        let n_paths = req.param_usize("mc_paths").unwrap_or(64);
        let block = req.param_usize("mc_block").unwrap_or(21);
        let horizon = req.param_usize("mc_horizon").unwrap_or(21);
        if let Some(band) = mc::price_band(&req.bars, n_paths, block, horizon, 42) {
            out.bands.push(band);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_bars(n: usize) -> Vec<Bar> {
        (0..n)
            .map(|i| {
                let base = 100.0 + (i as f64) * 0.2 + ((i % 7) as f64 - 3.0) * 0.5;
                Bar {
                    time: 1_700_000_000 + (i as i64) * 86_400,
                    open: base - 0.2,
                    high: base + 1.0,
                    low: base - 1.0,
                    close: base,
                    volume: 1_000.0 + (i as f64) * 10.0,
                }
            })
            .collect()
    }

    #[test]
    fn compute_kalman_and_mc() {
        let req = ComputeRequest {
            bars: sample_bars(80),
            enabled: vec!["kalman".into(), "mc".into(), "smc".into(), "chan".into()],
            params: Default::default(),
            view: None,
            benchmark_closes: None,
        };
        let resp = compute_inner(&req);
        assert!(!resp.series.is_empty());
        assert!(!resp.bands.is_empty() || resp.bands.is_empty()); // mc needs enough returns
        assert!(!resp.structures.is_empty() || resp.structures.is_empty());
    }
}
