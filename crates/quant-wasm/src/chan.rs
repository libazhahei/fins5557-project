//! Simplified Chan (缠论) structure: inclusion → fractal → bi → zhongshu.
//! Semantic reference: https://github.com/Vespa314/chan.py (MIT)
//! Prefer crates.io `chanlun` when wasm32-compatible; this subset is the WASM-safe fallback.

use crate::types::{Bar, StructureOut, StructurePoint};

#[derive(Clone)]
struct Merged {
    high: f64,
    low: f64,
    time: i64,
    idx: usize,
    direction: i8, // 1 up, -1 down
}

#[derive(Clone)]
struct Fractal {
    idx: usize,
    time: i64,
    price: f64,
    is_top: bool,
}

fn merge_bars(bars: &[Bar]) -> Vec<Merged> {
    let mut out: Vec<Merged> = Vec::new();
    for (i, b) in bars.iter().enumerate() {
        if out.is_empty() {
            out.push(Merged {
                high: b.high,
                low: b.low,
                time: b.time,
                idx: i,
                direction: 1,
            });
            continue;
        }
        let last = out.last().unwrap();
        let contained = b.high <= last.high && b.low >= last.low;
        let contains = b.high >= last.high && b.low <= last.low;
        if contained || contains {
            let dir = if out.len() >= 2 {
                let prev = &out[out.len() - 2];
                if last.high > prev.high { 1 } else { -1 }
            } else {
                last.direction
            };
            let mut m = last.clone();
            if dir > 0 {
                m.high = m.high.max(b.high);
                m.low = m.low.max(b.low);
            } else {
                m.high = m.high.min(b.high);
                m.low = m.low.min(b.low);
            }
            m.time = b.time;
            m.idx = i;
            m.direction = dir;
            *out.last_mut().unwrap() = m;
        } else {
            let dir = if b.high > last.high { 1 } else { -1 };
            out.push(Merged {
                high: b.high,
                low: b.low,
                time: b.time,
                idx: i,
                direction: dir,
            });
        }
    }
    out
}

fn fractals(merged: &[Merged]) -> Vec<Fractal> {
    let mut out = Vec::new();
    if merged.len() < 3 {
        return out;
    }
    for i in 1..merged.len() - 1 {
        let a = &merged[i - 1];
        let b = &merged[i];
        let c = &merged[i + 1];
        if b.high > a.high && b.high > c.high {
            out.push(Fractal {
                idx: b.idx,
                time: b.time,
                price: b.high,
                is_top: true,
            });
        } else if b.low < a.low && b.low < c.low {
            out.push(Fractal {
                idx: b.idx,
                time: b.time,
                price: b.low,
                is_top: false,
            });
        }
    }
    out
}

fn bi_from_fractals(fx: &[Fractal]) -> Vec<StructureOut> {
    let mut bi_points: Vec<&Fractal> = Vec::new();
    for f in fx {
        if let Some(last) = bi_points.last() {
            if last.is_top == f.is_top {
                // keep more extreme
                if (f.is_top && f.price >= last.price) || (!f.is_top && f.price <= last.price) {
                    bi_points.pop();
                    bi_points.push(f);
                }
                continue;
            }
            // require at least some separation in index
            if f.idx > last.idx + 1 {
                bi_points.push(f);
            }
        } else {
            bi_points.push(f);
        }
    }
    let mut out = Vec::new();
    for w in bi_points.windows(2) {
        out.push(StructureOut {
            id: format!("bi-{}-{}", w[0].idx, w[1].idx),
            kind: "bi".into(),
            label: "笔".into(),
            points: vec![
                StructurePoint {
                    time: w[0].time,
                    price: w[0].price,
                },
                StructurePoint {
                    time: w[1].time,
                    price: w[1].price,
                },
            ],
            top: Some(w[0].price.max(w[1].price)),
            bottom: Some(w[0].price.min(w[1].price)),
        });
    }
    out
}

fn zhongshu_from_bi(bi: &[StructureOut]) -> Vec<StructureOut> {
    let mut out = Vec::new();
    if bi.len() < 3 {
        return out;
    }
    // overlapping range of three consecutive bi endpoints
    for i in 0..bi.len().saturating_sub(2) {
        let a = &bi[i];
        let b = &bi[i + 1];
        let c = &bi[i + 2];
        let high = a
            .top
            .unwrap_or(0.0)
            .min(b.top.unwrap_or(0.0))
            .min(c.top.unwrap_or(0.0));
        let low = a
            .bottom
            .unwrap_or(0.0)
            .max(b.bottom.unwrap_or(0.0))
            .max(c.bottom.unwrap_or(0.0));
        // better: intersection of three bi price ranges
        let ranges: Vec<(f64, f64)> = [a, b, c]
            .iter()
            .map(|s| {
                let p0 = s.points[0].price;
                let p1 = s.points[1].price;
                (p0.min(p1), p0.max(p1))
            })
            .collect();
        let zg = ranges.iter().map(|r| r.1).fold(f64::INFINITY, f64::min);
        let zd = ranges.iter().map(|r| r.0).fold(f64::NEG_INFINITY, f64::max);
        if zg > zd {
            let t0 = a.points[0].time;
            let t1 = c.points[1].time;
            out.push(StructureOut {
                id: format!("zs-{i}"),
                kind: "zs".into(),
                label: "中枢".into(),
                points: vec![
                    StructurePoint {
                        time: t0,
                        price: zd,
                    },
                    StructurePoint {
                        time: t1,
                        price: zg,
                    },
                ],
                top: Some(zg),
                bottom: Some(zd),
            });
        }
        let _ = (high, low);
    }
    if out.len() > 8 {
        out = out.split_off(out.len() - 8);
    }
    out
}

pub fn detect(bars: &[Bar]) -> Vec<StructureOut> {
    let merged = merge_bars(bars);
    let fx = fractals(&merged);
    let mut bi = bi_from_fractals(&fx);
    let zs = zhongshu_from_bi(&bi);
    if bi.len() > 40 {
        bi = bi.split_off(bi.len() - 40);
    }
    bi.extend(zs);
    bi
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_structures_on_trend() {
        let bars: Vec<Bar> = (0..60)
            .map(|i| {
                let wave = ((i as f64) / 5.0).sin() * 3.0;
                let close = 100.0 + i as f64 * 0.3 + wave;
                Bar {
                    time: i,
                    open: close - 0.2,
                    high: close + 1.2,
                    low: close - 1.2,
                    close,
                    volume: 1.0,
                }
            })
            .collect();
        let s = detect(&bars);
        assert!(s.iter().any(|x| x.kind == "bi"));
    }
}
