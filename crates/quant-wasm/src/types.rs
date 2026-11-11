use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(default)]
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewRange {
    pub from_idx: usize,
    pub to_idx: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ComputeRequest {
    pub bars: Vec<Bar>,
    #[serde(default)]
    pub enabled: Vec<String>,
    #[serde(default)]
    pub params: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub view: Option<ViewRange>,
    #[serde(default)]
    pub benchmark_closes: Option<Vec<f64>>,
}

impl ComputeRequest {
    pub fn param_f64(&self, key: &str) -> Option<f64> {
        self.params.get(key)?.as_f64()
    }
    pub fn param_usize(&self, key: &str) -> Option<usize> {
        self.params
            .get(key)
            .and_then(|v| v.as_u64().map(|u| u as usize).or_else(|| v.as_f64().map(|f| f as usize)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesPoint {
    pub time: i64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesOut {
    pub id: String,
    pub pane: String,
    pub values: Vec<SeriesPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructurePoint {
    pub time: i64,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructureOut {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub points: Vec<StructurePoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bottom: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandPoint {
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mid: Option<f64>,
    pub upper_1sigma: f64,
    pub lower_1sigma: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upper_2sigma: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lower_2sigma: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinePoint {
    pub timestamp: String,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandOut {
    pub id: String,
    pub name: String,
    pub model_source: String,
    pub target_pane: String,
    pub render_type: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub band_series: Vec<BandPoint>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub line_series: Vec<LinePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ComputeResponse {
    pub series: Vec<SeriesOut>,
    pub structures: Vec<StructureOut>,
    pub bands: Vec<BandOut>,
}
