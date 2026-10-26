"""M9 — research report (rule-based; LLM polish optional via env later)."""

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


def build_report_markdown(metrics: dict[str, Any], template: str | None = None) -> str:
    lines = [
        "# 回测解读",
        "",
        f"**模板**：{template or metrics.get('mode') or 'custom'}",
        "",
        "## 做了什么",
        "",
        "按设定的标的、趋势/配置与成本假设，在历史区间上完成了回测（研究用途，非投资建议）。",
        "",
        "## 结果怎样",
        "",
        f"- 年化收益（CAGR）：{_fmt_pct(metrics.get('cagr'))}",
        f"- 波动：{_fmt_pct(metrics.get('vol'))}",
        f"- 夏普：{metrics.get('sharpe', 'n/a')}",
        f"- 最大回撤：{_fmt_pct(metrics.get('max_dd'))}",
        f"- 期末权益（相对 1.0）：{metrics.get('final_equity', 'n/a')}",
        f"- 样本约 {metrics.get('years', 'n/a')} 年",
        "",
        "## 主要风险 / 下一步",
        "",
        "- 历史表现不代表未来；短样本更容易过拟合。",
        "- 请核对成本、再平衡频率与现金替代假设是否现实。",
        "- 可尝试：改波动目标、增减资产、或再跑蒙特卡洛压力测试。",
        "",
        "```json",
        json.dumps({k: metrics[k] for k in metrics if k not in {"equity_uri"}}, default=str, indent=2)[:4000],
        "```",
        "",
    ]
    return "\n".join(lines)


def run_report(spec: JobSpec, store: ObjectStore) -> JobResult:
    assert spec.job_type == JobType.REPORT
    params: dict[str, Any] = spec.params
    metrics = dict(params.get("metrics") or {})
    template = params.get("template")
    try:
        md = build_report_markdown(metrics, template=template)
        uri = store.put("report/briefing.md", md.encode("utf-8"), content_type="text/markdown")
        return JobResult(
            job_type=JobType.REPORT,
            status="succeeded",
            output_uris=[uri],
            metrics={"chars": len(md), "uri": uri},
        )
    except Exception as exc:  # noqa: BLE001
        return JobResult(job_type=JobType.REPORT, status="failed", error=str(exc))
