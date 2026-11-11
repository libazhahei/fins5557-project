//! Light ARIMA(1,1,0) price band for browser Pred overlay.
//! Differenced closes → AR(1) OLS → forward mid + residual-σ cones.

use crate::mc::format_date;
use crate::types::{BandOut, BandPoint, Bar};

/// Fit ARIMA(1,1,0) ≈ AR(1) on first differences; forecast `horizon` steps.
pub fn price_band(bars: &[Bar], horizon: usize, lookback: usize) -> Option<BandOut> {
    if bars.len() < 20 || horizon == 0 {
        return None;
    }
    let n = bars.len().min(lookback.max(20));
    let slice = &bars[bars.len() - n..];
    let closes: Vec<f64> = slice.iter().map(|b| b.close).collect();
    let mut diffs = Vec::with_capacity(closes.len().saturating_sub(1));
    for w in closes.windows(2) {
        diffs.push(w[1] - w[0]);
    }
    if diffs.len() < 10 {
        return None;
    }
    // AR(1): d_t = c + φ d_{t-1} + e_t
    let (phi, c, sigma) = ar1_ols(&diffs)?;
    let last_close = *closes.last()?;
    let mut last_diff = *diffs.last()?;
    let last_time = slice.last()?.time;

    let mut series = Vec::with_capacity(horizon);
    let mut level = last_close;
    let mut var_accum = 0.0_f64;
    for h in 1..=horizon {
        let next_diff = c + phi * last_diff;
        level += next_diff;
        last_diff = next_diff;
        // Forecast error variance grows ~ σ² * (1 + φ² + …)
        var_accum += phi.powi(2 * ((h - 1) as i32));
        let se = sigma * (1.0 + var_accum).sqrt();
        let ts = format_date(last_time + (h as i64) * 86_400);
        series.push(BandPoint {
            timestamp: ts,
            mid: Some(level),
            upper_1sigma: level + se,
            lower_1sigma: level - se,
            upper_2sigma: Some(level + 2.0 * se),
            lower_2sigma: Some(level - 2.0 * se),
        });
    }

    Some(BandOut {
        id: "wasm_arima".into(),
        name: "ARIMA(1,1,0) Price Band (5D)".into(),
        model_source: "wasm_arima".into(),
        target_pane: "main_price".into(),
        render_type: "band".into(),
        band_series: series,
        line_series: vec![],
    })
}

fn ar1_ols(diffs: &[f64]) -> Option<(f64, f64, f64)> {
    let y: Vec<f64> = diffs[1..].to_vec();
    let x: Vec<f64> = diffs[..diffs.len() - 1].to_vec();
    if y.len() < 8 || y.len() != x.len() {
        return None;
    }
    let n = y.len() as f64;
    let mean_x = x.iter().sum::<f64>() / n;
    let mean_y = y.iter().sum::<f64>() / n;
    let mut sxx = 0.0;
    let mut sxy = 0.0;
    for i in 0..y.len() {
        let dx = x[i] - mean_x;
        sxx += dx * dx;
        sxy += dx * (y[i] - mean_y);
    }
    if sxx < 1e-12 {
        return None;
    }
    let phi = (sxy / sxx).clamp(-0.99, 0.99);
    let c = mean_y - phi * mean_x;
    let mut sse = 0.0;
    for i in 0..y.len() {
        let e = y[i] - (c + phi * x[i]);
        sse += e * e;
    }
    let sigma = (sse / (n - 2.0).max(1.0)).sqrt().max(1e-8);
    Some((phi, c, sigma))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arima_band_forward() {
        let bars: Vec<Bar> = (0..60)
            .map(|i| {
                let close = 100.0 + 0.15 * i as f64 + ((i % 5) as f64 - 2.0) * 0.3;
                Bar {
                    time: 1_700_000_000 + i * 86_400,
                    open: close,
                    high: close + 0.5,
                    low: close - 0.5,
                    close,
                    volume: 1000.0,
                }
            })
            .collect();
        let band = price_band(&bars, 5, 80).expect("band");
        assert_eq!(band.band_series.len(), 5);
        assert!(band.band_series[0].mid.unwrap().is_finite());
        assert!(band.band_series[0].upper_1sigma > band.band_series[0].lower_1sigma);
    }
}
