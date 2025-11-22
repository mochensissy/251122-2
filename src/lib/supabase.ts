import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('缺少 Supabase 环境变量配置');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface UserProfile {
  sequence: string;
  level: string;
  role_type: string;
  contact_email?: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  tag_sequence: string;
  tag_level: string;
  tag_role_type: string;
  doc_type: 'policy' | 'qa';
  is_chunked?: boolean;
  chunk_count?: number;
  created_at?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  sources?: string[];
  timestamp: number;
}

export interface EscalationTask {
  id: string;
  question: string;
  asker_profile: UserProfile;
  status: 'pending_expert' | 'pending_approval' | 'approved' | 'rejected';
  expert_answer?: string;
  leader_comment?: string;
  history: Message[];
  created_at?: string;
}

export interface SystemSettings {
  expert_email: string;
  leader_email: string;
  sla_text: string;
  contact_text: string;
  employee_feedback_email?: string;
}

export interface UserFeedback {
  id: string;
  conversation_id?: string;
  message_id?: string;
  query: string;
  ai_answer: string;
  feedback_type: 'positive' | 'negative';
  comment?: string;
  user_sequence?: string;
  user_level?: string;
  user_role_type?: string;
  sources?: string[];
  response_time_ms?: number;
  created_at?: string;
}

export interface FeedbackStats {
  total_feedback: number;
  positive_count: number;
  negative_count: number;
  satisfaction_rate: number;
}
