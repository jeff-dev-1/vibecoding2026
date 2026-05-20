#!/usr/bin/env bash
# 生成 SBOM (Software Bill of Materials)
# 用 syft (https://github.com/anchore/syft)
# 输出 SPDX + CycloneDX 两种格式 — 客户 GRC 部门可能两种都要

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$REPO_ROOT/security/deps/reports"
mkdir -p "$OUT"

echo "[sbom] generating SBOM for $REPO_ROOT"

# 1. backend image
echo "[sbom] backend (python)"
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$REPO_ROOT/backend:/src:ro" \
  anchore/syft:latest \
  /src \
  -o spdx-json="/src/../security/deps/reports/sbom-backend.spdx.json" \
  -o cyclonedx-json="/src/../security/deps/reports/sbom-backend.cdx.json" \
  || echo "(syft failed; rerun with: docker pull anchore/syft:latest)"

# 2. frontend image
echo "[sbom] frontend (node)"
docker run --rm \
  -v "$REPO_ROOT/frontend:/src:ro" \
  anchore/syft:latest \
  /src \
  -o spdx-json="/src/../security/deps/reports/sbom-frontend.spdx.json" \
  -o cyclonedx-json="/src/../security/deps/reports/sbom-frontend.cdx.json" \
  || echo "(syft failed; rerun with: docker pull anchore/syft:latest)"

echo "[sbom] done. reports at: $OUT"
echo ""
echo "next step: feed CycloneDX to your VEX/SCA system,"
echo "or run: docker run --rm -v \$(pwd):/repo aquasec/trivy fs /repo"
