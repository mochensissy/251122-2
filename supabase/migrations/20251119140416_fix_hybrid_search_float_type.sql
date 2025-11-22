/*
  # 修复混合检索函数的浮点类型问题
  
  修复 `hybrid_search` 函数中的类型不匹配问题
  将 FLOAT 类型统一改为 DOUBLE PRECISION
*/

DROP FUNCTION IF EXISTS hybrid_search(TEXT, VECTOR(1536), INTEGER, TEXT, TEXT, TEXT);

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
  vector_score DOUBLE PRECISION,
  keyword_score DOUBLE PRECISION,
  combined_score DOUBLE PRECISION
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
      (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION as vec_score
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
      ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', query_text))::DOUBLE PRECISION as kw_score
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
    COALESCE(vr.vec_score, 0::DOUBLE PRECISION) as vector_score,
    COALESCE(kr.kw_score, 0::DOUBLE PRECISION) as keyword_score,
    (COALESCE(vr.vec_score, 0::DOUBLE PRECISION) * 0.7 + COALESCE(kr.kw_score, 0::DOUBLE PRECISION) * 0.3) as combined_score
  FROM vector_results vr
  FULL OUTER JOIN keyword_results kr ON vr.chunk_id = kr.chunk_id
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
