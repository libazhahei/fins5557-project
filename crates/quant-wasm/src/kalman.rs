//! 1D Kalman price smoother.
//! Formula reference: QuantWave Kalman Filter
//! https://lavs9.github.io/quantwave/guides/indicators/native/kalman_filter/
//! https://github.com/lavs9/quantwave

use crate::types::{Bar, SeriesOut, SeriesPoint};

pub struct Kalman1D {
    q: f64,
    r: f64,
    x: Option<f64>,
    p: f64,
}

impl Kalman1D {
    pub fn new(q: f64, r: f64) -> Self {
        Self {
            q: q.max(1e-12),
            r: r.max(1e-12),
            x: None,
            p: 1.0,
        }
    }

    pub fn next(&mut self, z: f64) -> f64 {
        if !z.is_finite() {
            return self.x.unwrap_or(z);
        }
        match self.x {
            None => {
                self.x = Some(z);
                self.p = 1.0;
                z
            }
            Some(prev) => {
                let p_pred = self.p + self.q;
                let k = p_pred / (p_pred + self.r);
                let x = prev + k * (z - prev);
                self.p = (1.0 - k) * p_pred;
                self.x = Some(x);
                x
            }
        }
    }
}

pub fn smooth_closes(bars: &[Bar], q: f64, r: f64) -> SeriesOut {
    let mut kf = Kalman1D::new(q, r);
    let values = bars
        .iter()
        .map(|b| SeriesPoint {
            time: b.time,
            value: kf.next(b.close),
        })
        .collect();
    SeriesOut {
        id: "kalman".into(),
        pane: "main_price".into(),
        values,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smooths_noisy_series() {
        let bars: Vec<Bar> = (0..20)
            .map(|i| {
                let close = 100.0 + i as f64 + if i % 2 == 0 { 2.0 } else { -2.0 };
                Bar {
                    time: i,
                    open: close,
                    high: close,
                    low: close,
                    close,
                    volume: 1.0,
                }
            })
            .collect();
        let s = smooth_closes(&bars, 0.01, 0.1);
        assert_eq!(s.values.len(), 20);
        assert!(s.values[10].value.is_finite());
    }
}
