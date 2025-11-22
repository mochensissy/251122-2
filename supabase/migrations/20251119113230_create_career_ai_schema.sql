/*
  # 职业发展AI智能体 - 数据库架构初始化

  ## 新建表
  
  ### 1. user_profiles - 用户画像表
  存储每个用户的职业背景信息，用于个性化RAG检索
  - user_id: 用户唯一标识
  - sequence: 专业序列（如：人力资源、财务等）
  - level: 职级范围（如：P1-P3、P4-P5等）
  - role_type: 角色类型（管理岗/非管理岗）
  
  ### 2. knowledge_docs - 知识库文档表
  存储政策制度文档，支持标签化检索
  - title: 文档标题
  - content: 文档内容
  - tag_*: 标签字段（序列、职级、角色）
  - doc_type: 文档类型（policy/qa）
  
  ### 3. escalation_tasks - 上报任务表
  管理HITL工作流中的任务流转
  - question: 用户提问
  - asker_profile: 提问者画像（JSONB）
  - status: 任务状态（pending_expert/pending_approval/approved/rejected）
  - expert_answer: 专家答案
  - leader_comment: 领导批注
  
  ### 4. conversations - 对话历史表
  记录用户与AI的对话历史
  - user_id: 用户ID
  - role: 消息角色（user/ai）
  - content: 消息内容
  - sources: 引用来源（JSONB）
  
  ### 5. system_settings - 系统配置表
  存储可配置的系统参数
  - expert_email: COE专家邮箱
  - leader_email: HR领导邮箱
  - sla_text: SLA承诺文案

  ## 安全策略
  - 所有表启用RLS（Row Level Security）
  - 当前为原型阶段，暂时允许匿名访问
  - 生产环境需要实现基于认证的策略
*/

-- 用户画像表
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  sequence TEXT NOT NULL,
  level TEXT NOT NULL,
  role_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 知识库文档表
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tag_sequence TEXT NOT NULL DEFAULT '全员通用',
  tag_level TEXT NOT NULL DEFAULT '全职级',
  tag_role_type TEXT NOT NULL DEFAULT '全角色',
  doc_type TEXT DEFAULT 'policy',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 上报任务表
CREATE TABLE IF NOT EXISTS escalation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  asker_profile JSONB NOT NULL,
  status TEXT DEFAULT 'pending_expert',
  expert_answer TEXT,
  leader_comment TEXT,
  history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 对话历史表
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 原型阶段：允许所有匿名访问（生产环境需要修改）
CREATE POLICY "允许匿名读取用户画像"
  ON user_profiles FOR SELECT
  USING (true);

CREATE POLICY "允许匿名创建/更新用户画像"
  ON user_profiles FOR ALL
  USING (true);

CREATE POLICY "允许所有人读取知识文档"
  ON knowledge_docs FOR SELECT
  USING (true);

CREATE POLICY "允许所有人管理知识文档"
  ON knowledge_docs FOR ALL
  USING (true);

CREATE POLICY "允许所有人读取任务"
  ON escalation_tasks FOR SELECT
  USING (true);

CREATE POLICY "允许所有人管理任务"
  ON escalation_tasks FOR ALL
  USING (true);

CREATE POLICY "允许所有人读取对话"
  ON conversations FOR SELECT
  USING (true);

CREATE POLICY "允许所有人创建对话"
  ON conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "允许所有人读取系统配置"
  ON system_settings FOR SELECT
  USING (true);

CREATE POLICY "允许所有人管理系统配置"
  ON system_settings FOR ALL
  USING (true);

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tags ON knowledge_docs(tag_sequence, tag_level, tag_role_type);
CREATE INDEX IF NOT EXISTS idx_escalation_tasks_status ON escalation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);