//! Smart Money Concepts: swings, FVG, BOS/CHoCH.
//! Rules adapted from:
//! - https://github.com/joshyattridge/smart-money-concepts
//! - https://github.com/Khaymat/pyvsmc (MIT)

use crate::types::{Bar, StructureOut, StructurePoint};

#[derive(Clone, Copy)]
struct Swing {
    idx: usize,
    price: f64,
    is_high: bool,
}

fn swings(bars: &[Bar], strength: usize) -> Vec<Swing> {
    let n = bars.len();
    let mut out = Vec::new();
    if n < strength * 2 + 1 {
        return out;
    }
    for i in strength..n.saturating_sub(strength) {
        let h = bars[i].high;
        let l = bars[i].low;
        let mut is_sh = true;
        let mut is_sl = true;
        for k in 1..=strength {
            if bars[i - k].high >= h || bars[i + k].high >= h {
                is_sh = false;
            }
            if bars[i - k].low <= l || bars[i + k].low <= l {
                is_sl = false;
            }
        }
        if is_sh {
            out.push(Swing {
                idx: i,
                price: h,
                is_high: true,
            });
        } else if is_sl {
            out.push(Swing {
                idx: i,
                price: l,
                is_high: false,
            });
        }
    }
    out
}

fn detect_fvg(bars: &[Bar]) -> Vec<StructureOut> {
    let mut out = Vec::new();
    if bars.len() < 3 {
        return out;
    }
    for i in 1..bars.len() - 1 {
        // bullish: low[i+1] > high[i-1]
        if bars[i + 1].low > bars[i - 1].high {
            let top = bars[i + 1].low;
            let bottom = bars[i - 1].high;
            out.push(StructureOut {
                id: format!("fvg-bull-{i}"),
                kind: "fvg".into(),
                label: "FVG+".into(),
                points: vec![
                    StructurePoint {
                        time: bars[i - 1].time,
                        price: bottom,
                    },
                    StructurePoint {
                        time: bars[i + 1].time,
                        price: top,
                    },
                ],
                top: Some(top),
                bottom: Some(bottom),
            });
        }
        // bearish: high[i+1] < low[i-1]
        if bars[i + 1].high < bars[i - 1].low {
            let top = bars[i - 1].low;
            let bottom = bars[i + 1].high;
            out.push(StructureOut {
                id: format!("fvg-bear-{i}"),
                kind: "fvg".into(),
                label: "FVG-".into(),
                points: vec![
                    StructurePoint {
                        time: bars[i - 1].time,
                        price: top,
                    },
                    StructurePoint {
                        time: bars[i + 1].time,
                        price: bottom,
                    },
                ],
                top: Some(top),
                bottom: Some(bottom),
            });
        }
    }
    // keep recent gaps only to avoid clutter
    if out.len() > 24 {
        out = out.split_off(out.len() - 24);
    }
    out
}

fn detect_bos_choch(bars: &[Bar], swings: &[Swing]) -> Vec<StructureOut> {
    let mut out = Vec::new();
    if swings.len() < 3 {
        return out;
    }
    let mut trend: i8 = 0; // 1 bull, -1 bear
    for w in swings.windows(2) {
        let a = &w[0];
        let b = &w[1];
        if a.is_high == b.is_high {
            continue;
        }
        // look for close break of prior swing after b
        let level = a.price;
        let start = b.idx + 1;
        for j in start..bars.len() {
            let broke_up = bars[j].close > level && a.is_high;
            let broke_dn = bars[j].close < level && !a.is_high;
            if broke_up || broke_dn {
                let bullish = broke_up;
                let kind = if trend == 0 {
                    "bos"
                } else if (bullish && trend > 0) || (!bullish && trend < 0) {
                    "bos"
                } else {
                    "choch"
                };
                let label = if kind == "bos" {
                    if bullish { "BOS+" } else { "BOS-" }
                } else if bullish {
                    "CHoCH+"
                } else {
                    "CHoCH-"
                };
                out.push(StructureOut {
                    id: format!("{kind}-{}-{}", if bullish { "up" } else { "dn" }, j),
                    kind: kind.into(),
                    label: label.into(),
                    points: vec![
                        StructurePoint {
                            time: bars[a.idx].time,
                            price: level,
                        },
                        StructurePoint {
                            time: bars[j].time,
                            price: bars[j].close,
                        },
                    ],
                    top: Some(level),
                    bottom: Some(level),
                });
                trend = if bullish { 1 } else { -1 };
                break;
            }
        }
    }
    if out.len() > 16 {
        out = out.split_off(out.len() - 16);
    }
    out
}

pub fn detect(bars: &[Bar]) -> Vec<StructureOut> {
    let mut out = detect_fvg(bars);
    let sw = swings(bars, 2);
    out.extend(detect_bos_choch(bars, &sw));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_bullish_fvg() {
        let bars = vec![
            Bar {
                time: 1,
                open: 10.0,
                high: 10.0,
                low: 9.0,
                close: 9.5,
                volume: 1.0,
            },
            Bar {
                time: 2,
                open: 10.5,
                high: 12.0,
                low: 10.5,
                close: 11.5,
                volume: 1.0,
            },
            Bar {
                time: 3,
                open: 12.5,
                high: 13.0,
                low: 12.2,
                close: 12.8,
                volume: 1.0,
            },
        ];
        let f = detect_fvg(&bars);
        assert!(f.iter().any(|s| s.label == "FVG+"));
    }
}
