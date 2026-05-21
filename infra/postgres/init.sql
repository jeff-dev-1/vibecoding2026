-- AI Log Analysis Platform schema
-- 对应 DESIGN.md 第 3 节"数据模型"

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL CHECK (source IN ('nginx', 'app', 'custom')),
  raw          TEXT NOT NULL,
  byte_size    INT,
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS log_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       UUID NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
  chunk_idx    INT NOT NULL,
  line_start   INT NOT NULL,
  line_end     INT NOT NULL,
  text         TEXT NOT NULL,
  embedding    vector(384),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(log_id, chunk_idx)
);

CREATE INDEX IF NOT EXISTS log_chunks_emb_idx
  ON log_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id          UUID NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed')),
  summary         TEXT,
  -- evidence: {evidence: [...], analysis: {summary, events, traffic}}
  evidence        JSONB,
  -- 解析后的样本 entries; 前端表格 + 5 段链路展开行直接读
  sample_entries  JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

-- 对已经初始化过的库做兼容 (新列追加)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='analysis_jobs' AND column_name='sample_entries') THEN
    ALTER TABLE analysis_jobs ADD COLUMN sample_entries JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS analysis_jobs_log_idx ON analysis_jobs(log_id);
CREATE INDEX IF NOT EXISTS analysis_jobs_created_idx ON analysis_jobs(created_at DESC);
