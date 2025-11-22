/*
  # 增强混合检索：支持职级范围匹配

  优化点：
  1. 实现职级范围匹配 - P2用户可以匹配"P1-P3"标签的文档
  2. 更精细的"通用"vs"专属"逻辑
  3. 优先返回专属内容，其次通用内容
*/

DROP FUNCTION IF EXISTS hybrid_search(TEXT, VECTOR(1536), INTEGER, TEXT, TEXT, TEXT);

-- 辅助函数：判断用户职级是否匹配文档职级标签
CREATE OR REPLACE FUNCTION level_matches(
  doc_level TEXT,
  user_level TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  -- 通用标签：任何职级都匹配
  IF doc_level = '全职级' THEN
    RETURN TRUE;
  END IF;

  -- 精确匹配
  IF doc_level = user_level THEN
    RETURN TRUE;
  END IF;

  -- 范围匹配：P1-P3 包含 P1, P2, P3
  IF doc_level = 'P1-P3' AND user_level IN ('P1', 'P2', 'P3', 'P1-P3') THEN
    RETURN TRUE;
  END IF;

  -- 范围匹配：P4-P5 包含 P4, P5
  IF doc_level = 'P4-P5' AND user_level IN ('P4', 'P5', 'P4-P5') THEN
    RETURN TRUE;
  END IF;

  -- 范围匹配：P6-P7 包含 P6, P7
  IF doc_level = 'P6-P7' AND user_level IN ('P6', 'P7', 'P6-P7') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 主检索函数
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
      (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION as vec_score,
      -- 计算匹配度：专属内容加权更高
      CASE
        WHEN dc.tag_sequence = filter_sequence AND dc.tag_level != '全职级' AND dc.tag_role_type != '全角色' THEN 1.2
        WHEN dc.tag_sequence = filter_sequence OR level_matches(dc.tag_level, filter_level) OR dc.tag_role_type = filter_role_type THEN 1.1
        ELSE 1.0
      END as match_boost
    FROM document_chunks dc
    WHERE
      -- 序列匹配：用户序列 或 通用
      (filter_sequence IS NULL OR dc.tag_sequence = filter_sequence OR dc.tag_sequence = '全员通用')
      -- 职级匹配：使用范围匹配函数
      AND (filter_level IS NULL OR level_matches(dc.tag_level, filter_level))
      -- 角色匹配：用户角色 或 通用
      AND (filter_role_type IS NULL OR dc.tag_role_type = filter_role_type OR dc.tag_role_type = '全角色')
      AND dc.embedding IS NOT NULL
    ORDER BY (dc.embedding <=> query_embedding) * match_boost
    LIMIT match_count * 2
  ),
  keyword_results AS (
    SELECT
      dc.id as chunk_id,
      dc.doc_id,
      dc.content,
      ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', query_text))::DOUBLE PRECISION as kw_score,
      -- 同样的匹配度加权
      CASE
        WHEN dc.tag_sequence = filter_sequence AND dc.tag_level != '全职级' AND dc.tag_role_type != '全角色' THEN 1.2
        WHEN dc.tag_sequence = filter_sequence OR level_matches(dc.tag_level, filter_level) OR dc.tag_role_type = filter_role_type THEN 1.1
        ELSE 1.0
      END as match_boost
    FROM document_chunks dc
    WHERE
      to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', query_text)
      AND (filter_sequence IS NULL OR dc.tag_sequence = filter_sequence OR dc.tag_sequence = '全员通用')
      AND (filter_level IS NULL OR level_matches(dc.tag_level, filter_level))
      AND (filter_role_type IS NULL OR dc.tag_role_type = filter_role_type OR dc.tag_role_type = '全角色')
    ORDER BY kw_score * match_boost DESC
    LIMIT match_count * 2
  )
  SELECT
    COALESCE(vr.chunk_id, kr.chunk_id) as chunk_id,
    COALESCE(vr.doc_id, kr.doc_id) as doc_id,
    COALESCE(vr.content, kr.content) as content,
    COALESCE(vr.vec_score, 0::DOUBLE PRECISION) as vector_score,
    COALESCE(kr.kw_score, 0::DOUBLE PRECISION) as keyword_score,
    (
      COALESCE(vr.vec_score, 0::DOUBLE PRECISION) * 0.7 * COALESCE(vr.match_boost, 1.0) +
      COALESCE(kr.kw_score, 0::DOUBLE PRECISION) * 0.3 * COALESCE(kr.match_boost, 1.0)
    ) as combined_score
  FROM vector_results vr
  FULL OUTER JOIN keyword_results kr ON vr.chunk_id = kr.chunk_id
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
