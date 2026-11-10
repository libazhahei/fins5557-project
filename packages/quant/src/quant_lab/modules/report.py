"""M9 — research report (structured narrative; rule-based, locale-aware)."""

from __future__ import annotations

import json
from typing import Any

from quant_lab.jobs import JobResult, JobSpec, JobType
from quant_lab.ports import ObjectStore


def _fmt_pct(x: Any) -> str:
    try:
        return f"{100 * float(x):.2f}%"
    except (TypeError, ValueError):
        return "n/a"


def _fmt_num(x: Any, digits: int = 2) -> str:
    try:
        return f"{float(x):.{digits}f}"
    except (TypeError, ValueError):
        return "n/a"


def build_narrative(
    metrics: dict[str, Any],
    *,
    template: str | None = None,
    locale: str = "en",
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params = params or {}
    zh = locale.lower().startswith("zh")
    cagr = metrics.get("cagr")
    max_dd = metrics.get("max_dd")
    sharpe = metrics.get("sharpe")
    b_cagr = metrics.get("benchmark_cagr")
    b_dd = metrics.get("benchmark_max_drawdown")
    cost = params.get("cost_bps") or (params.get("backtest") or {}).get("cost_bps") or 10
    vol = (params.get("backtest") or {}).get("vol_target") or metrics.get("vol")
    trend_days = (params.get("backtest") or {}).get("trend_days", 200)
    use_fixtures = params.get("use_fixtures", True)

    vol_patch = max(0.05, float(vol) - 0.02) if vol is not None else 0.08
    try:
        vol_patch = round(float(vol_patch), 2)
    except (TypeError, ValueError):
        vol_patch = 0.08
    ma_patch = max(50, int(trend_days) - 50) if trend_days else 150

    if zh:
        headline = (
            f"策略年化 {_fmt_pct(cagr)}，最大回撤 {_fmt_pct(max_dd)}，夏普 {_fmt_num(sharpe)}；"
            f"相对 SPY 基准（年化 {_fmt_pct(b_cagr)} / 回撤 {_fmt_pct(b_dd)}）可对照风险收益取舍。"
        )
        attribution = (
            f"模板 {template or metrics.get('mode') or 'custom'} 在样本期内完成回测。"
            f"相对基准的差异主要来自仓位纪律与波动约束；"
            f"若复苏阶段仓位偏低，可能阶段性跑输 SPY。"
        )
        warnings = [
            f"已按约 {cost} bps 计入交易成本假设。",
            "Fixture 离线行情仅供研究，不代表实盘可成交价格。",
            "历史表现不代表未来；短样本更容易过拟合。",
        ]
        next_actions = [
            {
                "label": f"改 Vol={int(vol_patch*100)}% 重跑",
                "patch_params": {"strategy_params": {"vol_target": vol_patch}},
            },
            {
                "label": f"改 MA={ma_patch}d 重跑",
                "patch_params": {"strategy_params": {"trend_days": ma_patch}},
            },
            {
                "label": "成本改为 20bps 重跑",
                "patch_params": {"cost_bps": 20},
            },
        ]
    else:
        headline = (
            f"Strategy CAGR {_fmt_pct(cagr)}, MaxDD {_fmt_pct(max_dd)}, Sharpe {_fmt_num(sharpe)}; "
            f"compare vs SPY B&H (CAGR {_fmt_pct(b_cagr)} / MaxDD {_fmt_pct(b_dd)})."
        )
        attribution = (
            f"Template {template or metrics.get('mode') or 'custom'} finished over the sample window. "
            f"Gaps vs the benchmark mostly come from position discipline and vol targeting; "
            f"low exposure early in a recovery can lag SPY."
        )
        warnings = [
            f"Trading costs assumed at ~{cost} bps.",
            "Fixture offline data is for research only — not live fills.",
            "Past performance is not indicative of future results; short samples overfit easily.",
        ]
        if use_fixtures:
            warnings.append("Data source: Fixture (offline).")
        next_actions = [
            {
                "label": f"Rerun Vol={int(vol_patch*100)}%",
                "patch_params": {"strategy_params": {"vol_target": vol_patch}},
            },
            {
                "label": f"Rerun MA={ma_patch}d",
                "patch_params": {"strategy_params": {"trend_days": ma_patch}},
            },
            {
                "label": "Rerun cost=20bps",
                "patch_params": {"cost_bps": 20},
            },
        ]

    return {
        "headline": headline,
        "attribution": attribution,
        "honest_warnings": warnings,
        "next_actions": next_actions,
    }


def build_report_markdown(metrics: dict[str, Any], template: str | None = None, locale: str = "en") -> str:
    narrative = build_narrative(metrics, template=template, locale=locale)
    lines = [
        "# Backtest Brief" if not locale.lower().startswith("zh") else "# 回测解读",
        "",
        f"**Headline**: {narrative['headline']}",
        "",
        f"**Attribution**: {narrative['attribution']}",
        "",
        "## Warnings",
        "",
        *[f"- {w}" for w in narrative["honest_warnings"]],
        "",
        "```json",
        json.dumps({k: metrics[k] for k in metrics if not str(k).endswith("_uri")}, default=str, indent=2)[:4000],
        "```",
        "",
    ]
    return "\n".join(lines)


def run_report(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.REPORT
    params: dict[str, Any] = spec.params
    metrics = dict(params.get("metrics") or {})
    template = params.get("template")
    locale = params.get("locale") or "en"
    run_params = params.get("params") or {}
    try:
        narrative = build_narrative(
            metrics, template=template, locale=locale, params=run_params
        )
        md = build_report_markdown(metrics, template=template, locale=locale)
        uri = store.put("report/briefing.md", md.encode("utf-8"), content_type="text/markdown")
        store.put(
            "report/narrative.json",
            json.dumps(narrative).encode("utf-8"),
            content_type="application/json",
        )
        return JobResult(
            job_type=JobType.REPORT,
            status="succeeded",
            output_uris=[uri],
            metrics={"chars": len(md), "uri": uri, "narrative": narrative},
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.REPORT, status="failed", error=str(exc))
