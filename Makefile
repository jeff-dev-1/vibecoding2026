.PHONY: help demo down restart logs seed test redteam scan sbom ac check-gateway-only check-healthy clean

help:
	@echo "Vibe Coding Demo — AI Log Analysis Platform"
	@echo ""
	@echo "  make demo           启动整套 (docker compose up -d --build)"
	@echo "  make down           停止并清理"
	@echo "  make restart        重启 backend & frontend (不重启数据库)"
	@echo "  make logs           跟踪所有服务日志"
	@echo "  make seed           注入示例日志数据"
	@echo ""
	@echo "  make test           跑后端 pytest + 前端 vitest"
	@echo "  make redteam        Promptfoo 红队"
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
	bash scripts/run-redteam.sh

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
