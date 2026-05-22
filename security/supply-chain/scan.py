#!/usr/bin/env python3
"""本项目供应链门禁扫描 (Pattern B)。

扫 demo 自己的供应链 → 调 backend /gateway/supply-chain-check (真 Koi) → 按策略出门禁结论:
  - BLOCK            → fail build
  - REQUEST_APPROVAL → 必须在 approvals.yaml 出现 (= 已审批) 才放行, 否则 fail build
  - PASS             → 放行
  - 后端/Koi 不可用  → 当 REQUEST_APPROVAL 处理, 绝不静默 pass (fail-safe)

扫描对象:
  - backend/Dockerfile 的 pip 安装项  (marketplace=pypi)
  - frontend/package.json 的 dependencies (marketplace=npm)
  - security/supply-chain/ai-tools.yaml 列的 MCP / IDE 扩展

产出 reports/summary.json 并 POST 到 backend (页面"本项目供应链报告"读它)。
退出码: 门禁不过 → 1 (CI fail build)。

stdlib only, py3.6+ 兼容 (和 security/red-team/run.py 一样, 部署机直接能跑)。
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, "security", "supply-chain")
REPORTS_DIR = os.path.join(HERE, "reports")
BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
HTTP_TIMEOUT = 45  # Koi 对未知制品会触发 fetch+轮询, 给足时间


# ---------- 极简 YAML 读取 (只支持本项目这两个文件的 list-of-dict 结构) ----------

def _unq(v):
    v = v.strip()
    if len(v) >= 2 and v[0] in "\"'" and v[-1] == v[0]:
        return v[1:-1]
    return v


def load_yaml_list(path, top_key):
    items = []
    if not os.path.exists(path):
        return items
    in_section = False
    cur = None
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if not in_section:
                if s == top_key + ":" or s.startswith(top_key + ":"):
                    in_section = True
                continue
            indent = len(line) - len(line.lstrip())
            if indent == 0:  # 回到顶层 → 本段结束
                break
            if s.startswith("- "):
                if cur:
                    items.append(cur)
                cur = {}
                s = s[2:].strip()
            if ":" in s and cur is not None:
                k, v = s.split(":", 1)
                cur[k.strip()] = _unq(v)
    if cur:
        items.append(cur)
    return items


# ---------- 解析 demo 自己的依赖清单 ----------

def pip_from_dockerfile(path):
    names = []
    if not os.path.exists(path):
        return names
    collecting = False
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if "pip install" in line:
                collecting = True
                continue
            if not collecting:
                continue
            for m in re.finditer(r'"([A-Za-z][A-Za-z0-9_.\-]*)', line):
                names.append(m.group(1))
            if not line.rstrip().endswith("\\"):
                break
    return names


def npm_from_package_json(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return list(data.get("dependencies", {}).keys())


# ---------- HTTP (stdlib) ----------

def http_post(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BACKEND + path, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_get(path):
    with urllib.request.urlopen(BACKEND + path, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check_item(marketplace, item_id):
    """调 backend → 归一化裁定。后端不可用 → fail-safe 当 REQUEST_APPROVAL。"""
    try:
        v = http_post(
            "/gateway/supply-chain-check",
            {"marketplace": marketplace, "item_id": item_id},
        )
        return {
            "marketplace": marketplace,
            "item_id": item_id,
            "state": v.get("state", "REQUEST_APPROVAL"),
            "risk": v.get("risk"),
            "risk_level": v.get("risk_level"),
            "source": v.get("source", "koi"),
            "findings_count": len(v.get("findings") or []),
        }
    except (urllib.error.URLError, ValueError, OSError) as e:
        sys.stderr.write("  ! {0}/{1}: 后端调用失败 ({2}) — 按 REQUEST_APPROVAL 处理\n".format(
            marketplace, item_id, e))
        return {
            "marketplace": marketplace, "item_id": item_id,
            "state": "REQUEST_APPROVAL", "risk": None, "risk_level": None,
            "source": "offline", "findings_count": 0,
        }


def main():
    targets = []
    for name in pip_from_dockerfile(os.path.join(ROOT, "backend", "Dockerfile")):
        targets.append(("pypi", name))
    for name in npm_from_package_json(os.path.join(ROOT, "frontend", "package.json")):
        targets.append(("npm", name))
    for t in load_yaml_list(os.path.join(HERE, "ai-tools.yaml"), "tools"):
        if t.get("marketplace") and t.get("item_id"):
            targets.append((t["marketplace"], t["item_id"]))

    # 去重, 保序
    seen = set()
    uniq = []
    for mk, it in targets:
        key = (mk, it)
        if key not in seen:
            seen.add(key)
            uniq.append(key)

    approvals = set()
    for a in load_yaml_list(os.path.join(HERE, "approvals.yaml"), "approved"):
        if a.get("marketplace") and a.get("item_id"):
            approvals.add((a["marketplace"], a["item_id"]))

    try:
        koi_enabled = bool(http_get("/gateway/supply-chain/samples").get("enabled"))
    except Exception:
        koi_enabled = False

    print("供应链门禁扫描: {0} 个制品 → {1}".format(len(uniq), BACKEND))
    items, blocked, needs_approval, approved = [], [], [], []
    counts = {"PASS": 0, "REQUEST_APPROVAL": 0, "BLOCK": 0}

    for mk, it in uniq:
        r = check_item(mk, it)
        state = r["state"]
        ident = "{0}/{1}".format(mk, it)
        is_approved = (mk, it) in approvals
        r["approved"] = is_approved
        items.append(r)
        counts[state] = counts.get(state, 0) + 1
        if state == "BLOCK":
            blocked.append(ident)
        elif state == "REQUEST_APPROVAL":
            (approved if is_approved else needs_approval).append(ident)
        flag = "BLOCK " if state == "BLOCK" else (
            "APPROVED" if (state == "REQUEST_APPROVAL" and is_approved) else
            "NEEDS-APPROVAL" if state == "REQUEST_APPROVAL" else "PASS  ")
        print("  [{0:<14}] {1:<34} risk={2} ({3}) [{4}]".format(
            flag, ident, r.get("risk"), r.get("risk_level"), r["source"]))

    gate = "fail" if (blocked or needs_approval) else "pass"
    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "gate": gate,
        "total": len(uniq),
        "counts": counts,
        "blocked": blocked,
        "needs_approval": needs_approval,
        "approved": approved,
        "items": items,
        "koi_enabled": koi_enabled,
    }

    if not os.path.isdir(REPORTS_DIR):
        os.makedirs(REPORTS_DIR)
    out = os.path.join(REPORTS_DIR, "summary.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print("\n报告写入: {0}".format(out))

    try:
        http_post("/gateway/supply-chain-report", report)
        print("已 POST 到 backend (页面'本项目供应链报告'可见)")
    except Exception as e:
        sys.stderr.write("POST 报告失败 (不影响门禁结论): {0}\n".format(e))

    print("\n门禁结论: {0}  | PASS={1} APPROVED={2} NEEDS-APPROVAL={3} BLOCK={4}".format(
        gate.upper(), counts["PASS"], len(approved), len(needs_approval), counts["BLOCK"]))
    if gate == "fail":
        if blocked:
            print("  BLOCK (高危, 禁止): " + ", ".join(blocked))
        if needs_approval:
            print("  未审批的中风险 (加进 approvals.yaml 或下架): " + ", ".join(needs_approval))
        sys.exit(1)
    print("  ✅ 全部 PASS 或已审批")
    sys.exit(0)


if __name__ == "__main__":
    main()
