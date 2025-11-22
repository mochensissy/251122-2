/*
  # 创建批处理任务管理系统
  
  ## 概述
  为RAG文档处理系统添加完善的批处理任务管理功能,支持异步处理、进度跟踪、错误恢复等企业级特性。
  
  ## 1. 新增表结构
  
  ### batch_processing_tasks - 批处理任务表
  记录每次批量处理任务的完整信息:
  - `task_id`: 任务唯一标识
  - `status`: 任务状态 (pending/running/completed/failed/cancelled)
  - `total_docs`: 总文档数
  - `processed_docs`: 已处理文档数
  - `failed_docs`: 失败文档数
  - `started_at`: 开始时间
  - `completed_at`: 完成时间
  - `error_message`: 错误信息
  - `task_metadata`: 任务元数据(JSONB)
  
  ### batch_doc_processing_logs - 文档处理日志表
  记录每个文档的处理详情:
  - `doc_id`: 文档ID
  - `task_id`: 关联的批处理任务ID
  - `status`: 处理状态
  - `chunks_created`: 创建的分块数
  - `processing_time_ms`: 处理耗时
  - `error_message`: 错误信息
  
  ## 2. 安全策略
  启用RLS并配置访问策略
  
  ## 3. 索引优化
  为常用查询创建索引
  
  ## 4. 辅助函数
  创建批处理任务管理函数
*/

-- 1. 批处理任务状态枚举
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_task_status') THEN
    CREATE TYPE batch_task_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
  END IF;
END $$;

-- 2. 批处理任务表
CREATE TABLE IF NOT EXISTS batch_processing_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status batch_task_status DEFAULT 'pending' NOT NULL,
  
  -- 统计信息
  total_docs INTEGER DEFAULT 0,
  processed_docs INTEGER DEFAULT 0,
  failed_docs INTEGER DEFAULT 0,
  
  -- 时间信息
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 错误信息
  error_message TEXT,
  
  -- 扩展元数据
  task_metadata JSONB DEFAULT '{}'::JSONB,
  
  -- 创建者信息(可选)
  created_by TEXT DEFAULT 'system'
);

-- 3. 文档处理日志表
CREATE TABLE IF NOT EXISTS batch_doc_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES batch_processing_tasks(id) ON DELETE CASCADE,
  
  status batch_task_status DEFAULT 'pending' NOT NULL,
  
  -- 处理结果
  chunks_created INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  
  -- 错误信息
  error_message TEXT,
  
  -- 时间戳
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 启用RLS
ALTER TABLE batch_processing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_doc_processing_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS策略 - 允许所有用户访问(原型阶段)
CREATE POLICY "允许所有人查看批处理任务"
  ON batch_processing_tasks FOR SELECT
  USING (true);

CREATE POLICY "允许所有人创建批处理任务"
  ON batch_processing_tasks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "允许所有人更新批处理任务"
  ON batch_processing_tasks FOR UPDATE
  USING (true);

CREATE POLICY "允许所有人查看文档处理日志"
  ON batch_doc_processing_logs FOR SELECT
  USING (true);

CREATE POLICY "允许所有人创建文档处理日志"
  ON batch_doc_processing_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "允许所有人更新文档处理日志"
  ON batch_doc_processing_logs FOR UPDATE
  USING (true);

-- 6. 性能优化索引
CREATE INDEX IF NOT EXISTS idx_batch_tasks_status ON batch_processing_tasks(status);
CREATE INDEX IF NOT EXISTS idx_batch_tasks_created ON batch_processing_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_logs_task_id ON batch_doc_processing_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_batch_logs_doc_id ON batch_doc_processing_logs(doc_id);
CREATE INDEX IF NOT EXISTS idx_batch_logs_status ON batch_doc_processing_logs(status);

-- 7. 创建批处理任务初始化函数
CREATE OR REPLACE FUNCTION initialize_batch_task(
  doc_count INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  new_task_id UUID;
BEGIN
  INSERT INTO batch_processing_tasks (total_docs, status)
  VALUES (doc_count, 'pending')
  RETURNING id INTO new_task_id;
  
  RETURN new_task_id;
END;
$$;

-- 8. 更新批处理任务进度函数
CREATE OR REPLACE FUNCTION update_batch_task_progress(
  task_id_param UUID,
  processed_count INTEGER,
  failed_count INTEGER,
  new_status batch_task_status DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE batch_processing_tasks
  SET 
    processed_docs = processed_count,
    failed_docs = failed_count,
    status = COALESCE(new_status, status),
    started_at = COALESCE(started_at, NOW()),
    completed_at = CASE 
      WHEN new_status IN ('completed', 'failed', 'cancelled') THEN NOW()
      ELSE completed_at
    END
  WHERE id = task_id_param;
END;
$$;

-- 9. 获取批处理任务统计函数
CREATE OR REPLACE FUNCTION get_batch_processing_stats()
RETURNS TABLE (
  total_tasks BIGINT,
  running_tasks BIGINT,
  completed_tasks BIGINT,
  failed_tasks BIGINT,
  total_docs_processed BIGINT,
  avg_processing_time_ms NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_tasks,
    COUNT(*) FILTER (WHERE status = 'running')::BIGINT as running_tasks,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_tasks,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_tasks,
    COALESCE(SUM(processed_docs), 0)::BIGINT as total_docs_processed,
    COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000), 0) as avg_processing_time_ms
  FROM batch_processing_tasks;
END;
$$;

-- 10. 清理过期批处理任务函数 (保留最近30天)
CREATE OR REPLACE FUNCTION cleanup_old_batch_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM batch_processing_tasks
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND status IN ('completed', 'failed', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 11. 创建触发器: 自动更新任务完成状态
CREATE OR REPLACE FUNCTION auto_complete_batch_task()
RETURNS TRIGGER AS $$
BEGIN
  -- 当所有文档都处理完成时,自动更新任务状态
  IF NEW.processed_docs + NEW.failed_docs >= NEW.total_docs AND NEW.status = 'running' THEN
    IF NEW.failed_docs > 0 THEN
      NEW.status := 'failed';
    ELSE
      NEW.status := 'completed';
    END IF;
    NEW.completed_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_complete_batch_task
  BEFORE UPDATE ON batch_processing_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_batch_task();
