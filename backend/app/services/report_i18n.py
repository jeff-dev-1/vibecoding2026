"""把分析报告的散文翻成读者的界面语言。

为什么需要这一层: 报告是**数据** —— 上传时由 LLM 生成一次然后存库, 读的时候只是
取出来。但报告里的散文不是数据: 界面切成 English 之后, 摘要和关键发现还是中文,
那是整页最扎眼的一块漏译。

三个可选做法, 选了第三个:

  1. 每次切语言重跑分析 —— 贵, 而且可能得到**不同的结论**。同一份日志两次分析
     说法不一致, 比语言不对更糟。
  2. 上传时一次生成三份 —— 三倍 LLM 成本, 而且大多数演示只会用到一种语言。
  3. 按需翻译 + 落库缓存 —— 只翻译散文, 事实字段原样保留; 每份日志每种语言最多
     翻一次, 之后从库里取。

事实字段 (IP / 路径 / 状态码 / 严重度 / 计数 / 原始日志行) 不参与翻译:
它们是证据, 翻译过的证据没法拿去和原始日志对账。
"""
from __future__ import annotations

import contextlib
import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from ..db import SessionLocal
from ..gateway.client import GatewayError, chat
from ..prompts import REPORT_TRANSLATE_PROMPT, target_language_name

# 参与翻译的字段 —— 只有散文。改这个列表前先想清楚: 加进来的东西会被 LLM 改写。
_EVENT_PROSE = ("title", "description")


def _extract(analysis: dict) -> dict[str, Any]:
    """摘出要翻译的部分, 保持结构以便原样填回。"""
    return {
        "summary": analysis.get("summary", ""),
        "key_observations": list(analysis.get("key_observations") or []),
        "events": [
            {k: e.get(k, "") for k in _EVENT_PROSE} for e in (analysis.get("events") or [])
        ],
    }


def _merge(analysis: dict, translated: dict) -> dict:
    """把译文填回去。长度对不上就整份放弃 —— 宁可显示原文, 也不让条目错位。

    错位的后果很具体: 第 2 条发现的描述配到第 3 个事件上, 读者看到的是一句
    读得通、但指向错误证据的话。那比没翻译危险得多。
    """
    out = dict(analysis)
    if isinstance(translated.get("summary"), str) and translated["summary"].strip():
        out["summary"] = translated["summary"]

    obs = translated.get("key_observations")
    if isinstance(obs, list) and len(obs) == len(analysis.get("key_observations") or []):
        out["key_observations"] = [str(x) for x in obs]

    evs = translated.get("events")
    src_evs = analysis.get("events") or []
    if isinstance(evs, list) and len(evs) == len(src_evs):
        merged = []
        for src, tr in zip(src_evs, evs, strict=True):
            e = dict(src)
            if isinstance(tr, dict):
                for k in _EVENT_PROSE:
                    v = tr.get(k)
                    if isinstance(v, str) and v.strip():
                        e[k] = v
            merged.append(e)
        out["events"] = merged
    return out


async def _cached(job_id: UUID, lang: str) -> dict | None:
    async with SessionLocal() as s:
        row = (
            await s.execute(
                text(
                    "SELECT analysis::text AS a FROM analysis_translations "
                    "WHERE job_id = :j AND lang = :l"
                ),
                {"j": str(job_id), "l": lang},
            )
        ).one_or_none()
    return json.loads(row.a) if row else None


async def _store(job_id: UUID, lang: str, analysis: dict) -> None:
    async with SessionLocal() as s:
        await s.execute(
            text(
                "INSERT INTO analysis_translations (job_id, lang, analysis) "
                "VALUES (:j, :l, CAST(:a AS jsonb)) "
                "ON CONFLICT (job_id, lang) DO UPDATE SET analysis = EXCLUDED.analysis"
            ),
            {"j": str(job_id), "l": lang, "a": json.dumps(analysis)},
        )
        await s.commit()


async def translated_analysis(job_id: UUID, analysis: dict, lang: str) -> dict:
    """返回 lang 版本的报告。翻不动就原样返回 —— 这一层永远不该让读取失败。

    显示一份原文报告是可以接受的降级; 因为翻译服务抖动就打不开报告不是。
    """
    if not analysis:
        return analysis

    hit = await _cached(job_id, lang)
    if hit:
        return hit

    payload = _extract(analysis)
    if not payload["summary"] and not payload["key_observations"]:
        return analysis

    try:
        res = await chat(
            [
                {"role": "system", "content": REPORT_TRANSLATE_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Target language: {target_language_name(lang)}\n\n"
                        + json.dumps(payload, ensure_ascii=False)
                    ),
                },
            ],
            structured=True,
        )
        merged = _merge(analysis, json.loads(res.text))
    except (GatewayError, json.JSONDecodeError, KeyError, TypeError):
        return analysis

    # 缓存写不进去只是下次再翻一遍, 不影响这一次的结果
    with contextlib.suppress(Exception):
        await _store(job_id, lang, merged)
    return merged
