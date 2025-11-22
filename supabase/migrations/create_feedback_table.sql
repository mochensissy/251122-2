-- 创建用户反馈表
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联的对话和消息
  conversation_id UUID,
  message_id UUID,

  -- 用户查询和AI回答
  query TEXT NOT NULL,
  ai_answer TEXT NOT NULL,

  -- 反馈类型: 'positive' (满意/点赞), 'negative' (不满意/点踩)
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),

  -- 用户评论（可选）
  comment TEXT,

  -- 用户画像（记录反馈来源）
  user_sequence TEXT,
  user_level TEXT,
  user_role_type TEXT,

  -- 反馈元数据
  sources TEXT[], -- AI回答的来源文档
  response_time_ms INTEGER, -- 响应时间

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以加快查询
CREATE INDEX IF NOT EXISTS idx_feedback_type ON user_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_sequence ON user_feedback(user_sequence);

-- 创建视图：统计反馈数据
CREATE OR REPLACE VIEW feedback_stats AS
SELECT
  COUNT(*) AS total_feedback,
  COUNT(*) FILTER (WHERE feedback_type = 'positive') AS positive_count,
  COUNT(*) FILTER (WHERE feedback_type = 'negative') AS negative_count,
  ROUND(
    COUNT(*) FILTER (WHERE feedback_type = 'positive')::NUMERIC /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) AS satisfaction_rate
FROM user_feedback;

-- RLS策略（开发环境先允许所有操作）
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许所有操作（开发环境）" ON user_feedback
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 添加注释
COMMENT ON TABLE user_feedback IS '用户反馈表 - 记录用户对AI回答的满意度反馈';
COMMENT ON COLUMN user_feedback.feedback_type IS '反馈类型: positive (满意) 或 negative (不满意)';
COMMENT ON COLUMN user_feedback.comment IS '用户可选评论，提供更详细的反馈信息';
COMMENT ON VIEW feedback_stats IS '反馈统计视图 - 提供满意度汇总数据';
