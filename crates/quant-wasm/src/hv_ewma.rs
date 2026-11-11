//! Light HV / EWMA volatility forecast line for sub_volatility Pred pane.

use crate::mc::format_date;
use crate::types::{BandOut, Bar, LinePoint};

/// Trailing realized vol (log-return σ, annualized) + EWMA forward flat 5d sketch.
pub fn vol_forecast_line(bars: &[Bar], horizon: usize, window: usize) -> Option<BandOut> {
    if bars.len() < window + 2 || horizon == 0 {
        return None;
    }
    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
    let mut rets = Vec::with_capacity(closes.len().saturating_sub(1));
    for w in closes.windows(2) {
        if w[0] > 0.0 && w[1] > 0.0 {
            rets.push((w[1] / w[0]).ln());
        } else {
            rets.push(0.0);
        }
    }
    if rets.len() < window {
        return None;
    }

    let lambda = 0.94_f64;
    let mut ewma_var = {
        let seed = &rets[rets.len() - window..];
        let mean = seed.iter().sum::<f64>() / seed.len() as f64;
        seed.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / seed.len() as f64
    };
    let mut hist = Vec::with_capacity(window);
    let start = rets.len() - window;
    for (i, r) in rets[start..].iter().enumerate() {
        ewma_var = lambda * ewma_var + (1.0 - lambda) * r * r;
        let hv = (ewma_var * 252.0).sqrt();
        let t = bars[start + i + 1].time;
        hist.push(LinePoint {
            timestamp: format_date(t),
            value: hv,
            label: Some("EWMA HV".into()),
        });
    }

    let last_hv = hist.last()?.value;
    let last_time = bars.last()?.time;
    let mut line = hist;
    for h in 1..=horizon {
        // Research sketch: hold last EWMA level forward
        line.push(LinePoint {
            timestamp: format_date(last_time + (h as i64) * 86_400),
            value: last_hv,
            label: Some("EWMA fwd".into()),
        });
    }

    Some(BandOut {
        id: "wasm_hv_ewma".into(),
        name: "HV/EWMA Vol Forecast (5D)".into(),
        model_source: "wasm_hv_ewma".into(),
        target_pane: "sub_volatility".into(),
        render_type: "line".into(),
        band_series: vec![],
        line_series: line,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ewma_line_shape() {
        let bars: Vec<Bar> = (0..80)
            .map(|i| {
                let close = 100.0 * (1.0 + 0.001 * ((i % 9) as f64 - 4.0));
                Bar {
                    time: 1_700_000_000 + i * 86_400,
                    open: close,
                    high: close * 1.01,
                    low: close * 0.99,
                    close,
                    volume: 1000.0,
                }
            })
            .collect();
        let out = vol_forecast_line(&bars, 5, 20).expect("line");
        assert_eq!(out.render_type, "line");
        assert!(out.line_series.len() >= 25);
        assert_eq!(out.target_pane, "sub_volatility");
    }
}
