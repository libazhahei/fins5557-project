//! Light Monte Carlo price/equity band via block-bootstrap.
//! Algorithm aligned with packages/quant/src/quant_lab/modules/montecarlo.py
//! WASM packaging inspired by https://github.com/engan/mc-simulations

use crate::types::{BandOut, BandPoint, Bar};
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

pub fn block_bootstrap_paths(
    returns: &[f64],
    n_paths: usize,
    mut block: usize,
    seed: u64,
) -> Vec<Vec<f64>> {
    let n = returns.len();
    if n == 0 || n_paths == 0 {
        return vec![];
    }
    if n < block + 2 {
        block = (n / 4).max(1);
    }
    let mut rng = SmallRng::seed_from_u64(seed);
    let mut paths = Vec::with_capacity(n_paths);
    for _ in 0..n_paths {
        let mut out = Vec::with_capacity(n);
        while out.len() < n {
            let start = rng.gen_range(0..n.saturating_sub(block).max(1).max(1));
            let end = (start + block).min(n);
            out.extend_from_slice(&returns[start..end]);
        }
        out.truncate(n);
        paths.push(out);
    }
    paths
}

fn log_returns(closes: &[f64]) -> Vec<f64> {
    let mut r = Vec::with_capacity(closes.len().saturating_sub(1));
    for w in closes.windows(2) {
        if w[0] > 0.0 && w[1] > 0.0 {
            r.push((w[1] / w[0]).ln());
        } else {
            r.push(0.0);
        }
    }
    r
}

fn percentile(sorted: &mut [f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((p / 100.0) * (sorted.len() as f64 - 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Forward horizon band from last close using bootstrap of historical returns.
pub fn price_band(
    bars: &[Bar],
    n_paths: usize,
    block: usize,
    horizon: usize,
    seed: u64,
) -> Option<BandOut> {
    if bars.len() < 10 || horizon == 0 {
        return None;
    }
    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
    let rets = log_returns(&closes);
    if rets.len() < 5 {
        return None;
    }
    let paths = block_bootstrap_paths(&rets, n_paths, block, seed);
    if paths.is_empty() {
        return None;
    }
    let last = *closes.last()?;
    let last_time = bars.last()?.time;
    let mut series = Vec::with_capacity(horizon);
    for h in 1..=horizon {
        let mut levels: Vec<f64> = paths
            .iter()
            .map(|path| {
                let mut px = last;
                for step in 0..h {
                    let r = path[step % path.len()];
                    px *= r.exp();
                }
                px
            })
            .collect();
        let p10 = percentile(&mut levels.clone(), 10.0);
        let p25 = percentile(&mut levels.clone(), 25.0);
        let p50 = percentile(&mut levels.clone(), 50.0);
        let p75 = percentile(&mut levels.clone(), 75.0);
        let p90 = percentile(&mut levels, 90.0);
        let ts = format_date(last_time + (h as i64) * 86_400);
        series.push(BandPoint {
            timestamp: ts,
            mid: Some(p50),
            upper_1sigma: p75,
            lower_1sigma: p25,
            upper_2sigma: Some(p90),
            lower_2sigma: Some(p10),
        });
    }
    Some(BandOut {
        id: "wasm_mc".into(),
        name: "WASM MC Channel".into(),
        model_source: "wasm_mc".into(),
        target_pane: "main_price".into(),
        render_type: "band".into(),
        band_series: series,
    })
}

fn format_date(unix: i64) -> String {
    // YYYY-MM-DD approx via days since epoch (UTC)
    let days = unix.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_shapes() {
        let rets = vec![0.01, -0.005, 0.002, 0.0, 0.003, -0.001, 0.004];
        let paths = block_bootstrap_paths(&rets, 8, 3, 1);
        assert_eq!(paths.len(), 8);
        assert_eq!(paths[0].len(), rets.len());
    }

    #[test]
    fn band_from_bars() {
        let bars: Vec<Bar> = (0..40)
            .map(|i| {
                let close = 100.0 * (1.0 + 0.001 * i as f64);
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
        let band = price_band(&bars, 32, 5, 10, 7).expect("band");
        assert_eq!(band.band_series.len(), 10);
        assert!(band.band_series[0].mid.unwrap().is_finite());
    }
}
