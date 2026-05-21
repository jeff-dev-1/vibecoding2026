FROM python:3.11-slim
WORKDIR /app
COPY mock-llm.py .
EXPOSE 11434
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD wget -qO- http://localhost:11434/health || exit 1
CMD ["python", "-u", "mock-llm.py"]
