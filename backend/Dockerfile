FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./

# 使用 Aliyun PyPI mirror 加速 (CN-friendly); 海外构建可移除 -i 参数或换成 official
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ARG PIP_TRUSTED_HOST=mirrors.aliyun.com
RUN pip install --no-cache-dir \
      -i ${PIP_INDEX_URL} --trusted-host ${PIP_TRUSTED_HOST} \
      "fastapi==0.115.*" \
      "uvicorn[standard]==0.32.*" \
      "pydantic==2.9.*" \
      "asyncpg==0.30.*" \
      "sqlalchemy[asyncio]==2.0.*" \
      "pgvector==0.3.*" \
      "httpx==0.27.*" \
      "python-multipart==0.0.12" \
      "opentelemetry-api==1.28.*" \
      "opentelemetry-sdk==1.28.*" \
      "opentelemetry-instrumentation-fastapi==0.49b2" \
      "opentelemetry-exporter-otlp==1.28.*" \
      "ruff==0.7.*" \
      "pytest==8.3.*" \
      "pytest-asyncio==0.24.*" \
      "pytest-cov==6.0.*"

COPY app ./app
COPY tests ./tests

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=60s \
  CMD wget -qO- http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
