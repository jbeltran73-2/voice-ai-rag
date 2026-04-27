-- Voice Chat RAG - Supabase Schema
-- Run on supabase.memba.es

CREATE SCHEMA IF NOT EXISTS voicechat;
GRANT USAGE ON SCHEMA voicechat TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE voicechat.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_size BIGINT,
  status TEXT DEFAULT 'uploading',  -- uploading | processing | indexed | error
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE voicechat.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES voicechat.documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',  -- {page, filename, section}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON voicechat.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

GRANT ALL ON ALL TABLES IN SCHEMA voicechat TO anon, authenticated, service_role;
