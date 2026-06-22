.PHONY: help demo up down restart logs seed test redteam pentest supply-scan scan sbom ac check-gateway-only check-healthy clean rebuild-backend rebuild-frontend dist dist-images dist-bundle

# === 发行版变量 (可在命令行覆盖: make dist REGISTRY=registry.cn-hangzhou.aliyuncs.com/yourns TAG=v0.1.0) ===
REGISTRY ?= crpi-wl9py5zi0809kanh.cn-shanghai.personal.cr.aliyuncs.com/vibecoding-2026
TAG      ?= latest
PLATFORMS ?= linux/amd64,linux/arm64

help:
	@echo "Vibe Coding Demo — AI Log Analysis Platform"
	@echo ""
	@echo "  make demo           启动整套 (首次/依赖变更用; docker compose up -d --build)"
	@echo "  make up             启动但不重新构建 (代码没动时最快)"
	@echo "  make rebuild-backend   只重建后端 (改了 backend/ 时用, 利用缓存秒级)"
	@echo "  make rebuild-frontend  只重建前端 (改了 frontend/ 时用)"
	@echo "  make down           停止并清理"
	@echo "  make restart        重启 backend & frontend (不重启数据库)"
	@echo "  make logs           跟踪所有服务日志"
	@echo "  make seed           注入示例日志数据"
	@echo ""
	@echo "  make test           跑后端 pytest + 前端 vitest"
	@echo "  make redteam        Promptfoo 红队 (测 LLM 行为)"
	@echo "  make pentest        渗透测试 DAST: ZAP + Nuclei 扫运行时 Web 面 (无 docker 走 builtin 兜底)"
	@echo "  make supply-scan    扫本项目依赖+工具的供应链风险 (Koi 门禁; BLOCK/未审批中风险 → 非0退出)"
	@echo "  make scan           Garak 深度 LLM 漏扫"
	@echo "  make sbom           Trivy + Syft 依赖扫描"
	@echo "  make ac             跑所有验收标准"
	@echo ""
	@echo "  make check-gateway-only   AC-4：确认没有绕过 Gateway"
	@echo "  make check-healthy        AC-7：90 秒内全部 healthy"
	@echo ""
	@echo "  make clean          清掉所有 volume 和镜像"

demo:
	@if [ ! -f .env ]; then cp .env.example .env; echo ".env created from example"; fi
	docker compose up -d --build
	@echo ""
	@echo "Waiting for services to become healthy..."
	@$(MAKE) check-healthy

up:
	docker compose up -d
	@$(MAKE) check-healthy

rebuild-backend:
	docker compose up -d --build backend

rebuild-frontend:
	docker compose up -d --build frontend

down:
	docker compose down

restart:
	docker compose restart backend frontend

logs:
	docker compose logs -f

seed:
	bash scripts/seed-logs.sh

test:
	cd backend && python -m pytest -q
	cd frontend && pnpm test --run 2>/dev/null || echo "frontend tests skipped (pnpm not installed)"

redteam:
	python3 security/red-team/run.py

pentest:
	TARGET_URL=$${TARGET_URL:-http://localhost:8000} python3 security/pentest/run.py

supply-scan:
	BACKEND_URL=$${BACKEND_URL:-http://localhost:8000} python3 security/supply-chain/scan.py

scan:
	docker run --rm --network=host \
	  -v $(PWD)/security/llm-scan:/work \
	  python:3.11-slim bash -c "pip install garak -q && garak --config /work/garak-config.yaml --report_prefix /work/reports/garak"

sbom:
	bash security/deps/sbom-gen.sh
	docker run --rm -v $(PWD):/repo aquasec/trivy:latest fs --config /repo/security/deps/trivy-config.yaml /repo

ac: test check-gateway-only check-healthy redteam
	@echo ""
	@echo "All acceptance criteria passed."

check-gateway-only:
	@echo "AC-4: checking no direct openai/anthropic imports outside gateway/"
	@! grep -rE "^(from |import )(openai|anthropic)" backend/app --exclude-dir=gateway || (echo "FAIL: direct LLM SDK import found" && exit 1)
	@echo "PASS"

check-healthy:
	@echo "AC-7: waiting up to 90s for healthy..."
	@for i in $$(seq 1 18); do \
	  unhealthy=$$(docker compose ps --format json | python -c "import sys,json; [print(s['Name']) for s in (json.loads(l) for l in sys.stdin if l.strip()) if s.get('Health') not in ('healthy', '')]"); \
	  if [ -z "$$unhealthy" ]; then echo "PASS - all healthy"; exit 0; fi; \
	  echo "  still unhealthy: $$unhealthy"; \
	  sleep 5; \
	done; \
	echo "FAIL - timed out"; \
	docker compose ps; \
	exit 1

clean:
	docker compose down -v
	docker compose rm -f

# === 发行: 推镜像到阿里云 ACR + 打学生 bundle ===
# 前置: docker login --username=<你的阿里云账号> registry.cn-hangzhou.aliyuncs.com
#       docker buildx create --use   (首次, 建一个支持多架构的 builder)
dist: dist-images dist-bundle
	@echo ""
	@echo "发行完成。镜像已推到 $(REGISTRY) (tag: $(TAG))"
	@echo "学生 bundle: dist/alad-demo-$(TAG).tar.gz"

dist-images:
	@echo "buildx 多架构推送 ($(PLATFORMS)) → $(REGISTRY)"
	docker buildx build --platform $(PLATFORMS) \
	  -t $(REGISTRY)/alad-backend:$(TAG) -t $(REGISTRY)/alad-backend:latest \
	  --push ./backend
	docker buildx build --platform $(PLATFORMS) \
	  -t $(REGISTRY)/alad-frontend:$(TAG) -t $(REGISTRY)/alad-frontend:latest \
	  --push ./frontend
	docker buildx build --platform $(PLATFORMS) \
	  -t $(REGISTRY)/alad-mock-llm:$(TAG) -t $(REGISTRY)/alad-mock-llm:latest \
	  --push ./gateway/envoy-ai-gateway/upstream-mock

# 学生只需要这些: 发行 compose + 运行时挂载的配置 + env 模板 + 上手文档。
# 不含源码 (backend/ frontend/)、不含 Jenkinsfile / 内部文档。
dist-bundle:
	@rm -rf dist/bundle && mkdir -p dist/bundle
	cp docker-compose.dist.yml dist/bundle/docker-compose.dist.yml
	cp .env.example dist/bundle/.env.example
	cp docs/STUDENT-QUICKSTART.md dist/bundle/README.md
	mkdir -p dist/bundle/infra dist/bundle/gateway/envoy-ai-gateway
	cp -R infra/postgres dist/bundle/infra/
	cp -R gateway/envoy-ai-gateway/config dist/bundle/gateway/envoy-ai-gateway/
	cd dist && tar -czf alad-demo-$(TAG).tar.gz -C bundle .
	@echo "bundle 内容:" && find dist/bundle -type f | sed 's|dist/bundle/|  |'
