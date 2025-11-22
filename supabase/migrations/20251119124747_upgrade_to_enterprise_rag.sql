/*
  # 升级到企业级RAG系统架构
  
  ## 概述
  本次迁移将现有的简单文档检索升级为企业级RAG系统,支持向量化检索、智能分块和混合检索策略。
  
  ## 1. 新增表结构
  
  ### document_chunks - 文档分块表
  存储经过智能分块处理后的文档片段,每个片段包含:
  - `chunk_id`: 分块唯一标识
  - `doc_id`: 关联原始文档ID(外键到knowledge_docs)
  - `chunk_index`: 片段在原文档中的序号
  - `content`: 分块内容(500-1000字符)
  - `token_count`: 分块的token数量
  - `embedding`: 向量嵌入(使用pgvector,维度1536)
  - 元数据字段: 序列、职级、角色标签(继承自父文档)
  
  ### chunk_metadata - 分块元数据表
  存储分块的扩展元数据,用于高级检索:
  - `chunk_id`: 关联分块ID
  - `keywords`: 提取的关键词(数组)
  - `entities`: 实体识别结果(JSONB,如:人名、政策名、部门名)
  - `section_title`: 所属章节标题
  - `relevance_score`: 预计算的基础相关性分数
  
  ### search_logs - 检索日志表
  记录每次检索请求,用于分析和优化:
  - `query`: 用户查询文本
  - `user_profile`: 用户画像(JSONB)
  - `retrieval_method`: 检索方法(vector/keyword/hybrid)
  - `matched_chunks`: 匹配到的分块ID数组
  - `response_time_ms`: 响应时间(毫秒)
  - `user_feedback`: 用户反馈(helpful/not_helpful)
  
  ## 2. 启用向量扩展
  启用pgvector扩展,支持向量相似度搜索
  
  ## 3. 安全策略
  为新表启用RLS并配置基本策略
  
  ## 4. 索引优化
  - 向量索引: 使用HNSW算法加速向量检索
  - 全文搜索索引: 支持中文分词的GIN索引
  - 复合索引: 标签字段组合索引
*/

-- 1. 启用pgvector扩展(用于向量检索)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 文档分块表
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  embedding VECTOR(1536),
  
  -- 继承自父文档的元数据
  tag_sequence TEXT NOT NULL,
  tag_level TEXT NOT NULL,
  tag_role_type TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 确保同一文档的分块索引唯一
  CONSTRAINT unique_doc_chunk UNIQUE (doc_id, chunk_index)
);

-- 3. 分块元数据表
CREATE TABLE IF NOT EXISTS chunk_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  keywords TEXT[] DEFAULT '{}',
  entities JSONB DEFAULT '{}',
  section_title TEXT,
  relevance_score FLOAT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_chunk_metadata UNIQUE (chunk_id)
);

-- 4. 检索日志表
CREATE TABLE IF NOT EXISTS search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  user_profile JSONB,
  retrieval_method TEXT DEFAULT 'hybrid',
  matched_chunks UUID[],
  response_time_ms INTEGER,
  user_feedback TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 启用RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS策略 - 原型阶段允许所有访问
CREATE POLICY "允许所有人读取文档分块"
  ON document_chunks FOR SELECT
  USING (true);

CREATE POLICY "允许所有人管理文档分块"
  ON document_chunks FOR ALL
  USING (true);

CREATE POLICY "允许所有人读取分块元数据"
  ON chunk_metadata FOR SELECT
  USING (true);

CREATE POLICY "允许所有人管理分块元数据"
  ON chunk_metadata FOR ALL
  USING (true);

CREATE POLICY "允许所有人创建检索日志"
  ON search_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "允许所有人读取检索日志"
  ON search_logs FOR SELECT
  USING (true);

-- 7. 性能优化索引

-- 向量相似度搜索索引(使用HNSW算法)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
  ON document_chunks 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 文档关联索引
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id 
  ON document_chunks(doc_id);

-- 标签组合索引(用于元数据过滤)
CREATE INDEX IF NOT EXISTS idx_chunks_tags 
  ON document_chunks(tag_sequence, tag_level, tag_role_type);

-- 全文搜索索引
CREATE INDEX IF NOT EXISTS idx_chunks_content_gin 
  ON document_chunks 
  USING gin(to_tsvector('simple', content));

-- 元数据表索引
CREATE INDEX IF NOT EXISTS idx_metadata_chunk_id 
  ON chunk_metadata(chunk_id);

-- 关键词搜索索引
CREATE INDEX IF NOT EXISTS idx_metadata_keywords 
  ON chunk_metadata 
  USING gin(keywords);

-- 检索日志查询索引
CREATE INDEX IF NOT EXISTS idx_search_logs_created 
  ON search_logs(created_at DESC);

-- 8. 创建向量相似度搜索函数
CREATE OR REPLACE FUNCTION search_chunks_by_embedding(
  query_embedding VECTOR(1536),
  match_count INTEGER DEFAULT 10,
  filter_sequence TEXT DEFAULT NULL,
  filter_level TEXT DEFAULT NULL,
  filter_role_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  doc_id UUID,
  content TEXT,
  similarity FLOAT,
  tag_sequence TEXT,
  tag_level TEXT,
  tag_role_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id as chunk_id,
    dc.doc_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.tag_sequence,
    dc.tag_level,
    dc.tag_role_type
  FROM document_chunks dc
  WHERE 
    (filter_sequence IS NULL OR dc.tag_sequence = filter_sequence OR dc.tag_sequence = '全员通用')
    AND (filter_level IS NULL OR dc.tag_level = filter_level OR dc.tag_level = '全职级')
    AND (filter_role_type IS NULL OR dc.tag_role_type = filter_role_type OR dc.tag_role_type = '全角色')
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 9. 创建混合检索函数(向量+关键词)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(1536),
  match_count INTEGER DEFAULT 5,
  filter_sequence TEXT DEFAULT NULL,
  filter_level TEXT DEFAULT NULL,
  filter_role_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  doc_id UUID,
  content TEXT,
  vector_score FLOAT,
  keyword_score FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT 
      dc.id as chunk_id,
      dc.doc_id,
      dc.content,
      1 - (dc.embedding <=> query_embedding) as vec_score
    FROM document_chunks dc
    WHERE 
      (filter_sequence IS NULL OR dc.tag_sequence = filter_sequence OR dc.tag_sequence = '全员通用')
      AND (filter_level IS NULL OR dc.tag_level = filter_level OR dc.tag_level = '全职级')
      AND (filter_role_type IS NULL OR dc.tag_role_type = filter_role_type OR dc.tag_role_type = '全角色')
      AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT 
      dc.id as chunk_id,
      dc.doc_id,
      dc.content,
      ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', query_text)) as kw_score
    FROM document_chunks dc
    WHERE 
      to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', query_text)
      AND (filter_sequence IS NULL OR dc.tag_sequence = filter_sequence OR dc.tag_sequence = '全员通用')
      AND (filter_level IS NULL OR dc.tag_level = filter_level OR dc.tag_level = '全职级')
      AND (filter_role_type IS NULL OR dc.tag_role_type = filter_role_type OR dc.tag_role_type = '全角色')
    ORDER BY kw_score DESC
    LIMIT match_count * 2
  )
  SELECT 
    COALESCE(vr.chunk_id, kr.chunk_id) as chunk_id,
    COALESCE(vr.doc_id, kr.doc_id) as doc_id,
    COALESCE(vr.content, kr.content) as content,
    COALESCE(vr.vec_score, 0) as vector_score,
    COALESCE(kr.kw_score, 0) as keyword_score,
    (COALESCE(vr.vec_score, 0) * 0.7 + COALESCE(kr.kw_score, 0) * 0.3) as combined_score
  FROM vector_results vr
  FULL OUTER JOIN keyword_results kr ON vr.chunk_id = kr.chunk_id
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- 10. 为现有knowledge_docs表添加分块状态字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'knowledge_docs' AND column_name = 'is_chunked'
  ) THEN
    ALTER TABLE knowledge_docs 
    ADD COLUMN is_chunked BOOLEAN DEFAULT false,
    ADD COLUMN chunk_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- 11. 创建触发器:文档更新时自动标记需要重新分块
CREATE OR REPLACE FUNCTION mark_doc_for_rechunking()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.content IS DISTINCT FROM NEW.content) THEN
    NEW.is_chunked := false;
    NEW.chunk_count := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_rechunking
  BEFORE UPDATE ON knowledge_docs
  FOR EACH ROW
  EXECUTE FUNCTION mark_doc_for_rechunking();
