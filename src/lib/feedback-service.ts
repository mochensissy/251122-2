/**
 * 用户反馈服务
 *
 * 功能:
 * 1. 提交用户反馈（满意/不满意）
 * 2. 查询反馈统计数据
 * 3. 获取反馈历史
 */

import { supabase } from './supabase';
import type { UserFeedback, FeedbackStats, UserProfile } from './supabase';

/**
 * 提交反馈参数
 */
export interface SubmitFeedbackParams {
  query: string;
  aiAnswer: string;
  feedbackType: 'positive' | 'negative';
  comment?: string;
  userProfile?: UserProfile;
  sources?: string[];
  responseTimeMs?: number;
  conversationId?: string;
  messageId?: string;
}

/**
 * 反馈服务类
 */
class FeedbackService {
  /**
   * 提交用户反馈
   */
  async submitFeedback(params: SubmitFeedbackParams): Promise<{ success: boolean; error?: string }> {
    try {
      const feedbackData: Partial<UserFeedback> = {
        query: params.query,
        ai_answer: params.aiAnswer,
        feedback_type: params.feedbackType,
        comment: params.comment,
        user_sequence: params.userProfile?.sequence,
        user_level: params.userProfile?.level,
        user_role_type: params.userProfile?.role_type,
        sources: params.sources,
        response_time_ms: params.responseTimeMs,
        conversation_id: params.conversationId,
        message_id: params.messageId,
      };

      const { error } = await supabase
        .from('user_feedback')
        .insert(feedbackData);

      if (error) {
        console.error('[FeedbackService] 提交反馈失败:', error);
        return { success: false, error: error.message };
      }

      console.log(`[FeedbackService] 反馈已提交: ${params.feedbackType}`);
      return { success: true };
    } catch (error) {
      console.error('[FeedbackService] 提交反馈异常:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 获取反馈统计
   */
  async getStats(): Promise<FeedbackStats | null> {
    try {
      const { data, error } = await supabase
        .from('feedback_stats')
        .select('*')
        .single();

      if (error) {
        console.error('[FeedbackService] 获取统计失败:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[FeedbackService] 获取统计异常:', error);
      return null;
    }
  }

  /**
   * 获取最近的反馈记录
   */
  async getRecentFeedback(limit: number = 20): Promise<UserFeedback[]> {
    try {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[FeedbackService] 获取反馈历史失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[FeedbackService] 获取反馈历史异常:', error);
      return [];
    }
  }

  /**
   * 获取特定类型的反馈
   */
  async getFeedbackByType(
    feedbackType: 'positive' | 'negative',
    limit: number = 20
  ): Promise<UserFeedback[]> {
    try {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .eq('feedback_type', feedbackType)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error(`[FeedbackService] 获取${feedbackType}反馈失败:`, error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(`[FeedbackService] 获取${feedbackType}反馈异常:`, error);
      return [];
    }
  }

  /**
   * 获取带评论的反馈（用于改进分析）
   */
  async getFeedbackWithComments(limit: number = 50): Promise<UserFeedback[]> {
    try {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[FeedbackService] 获取带评论反馈失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[FeedbackService] 获取带评论反馈异常:', error);
      return [];
    }
  }

  /**
   * 按用户序列统计反馈
   */
  async getStatsBySequence(): Promise<Record<string, FeedbackStats>> {
    try {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('user_sequence, feedback_type');

      if (error) {
        console.error('[FeedbackService] 获取序列统计失败:', error);
        return {};
      }

      if (!data) return {};

      const stats: Record<string, any> = {};

      data.forEach((item) => {
        const sequence = item.user_sequence || '未知';
        if (!stats[sequence]) {
          stats[sequence] = {
            total_feedback: 0,
            positive_count: 0,
            negative_count: 0,
          };
        }

        stats[sequence].total_feedback++;
        if (item.feedback_type === 'positive') {
          stats[sequence].positive_count++;
        } else {
          stats[sequence].negative_count++;
        }
      });

      // 计算满意率
      Object.keys(stats).forEach((sequence) => {
        const s = stats[sequence];
        s.satisfaction_rate = s.total_feedback > 0
          ? parseFloat(((s.positive_count / s.total_feedback) * 100).toFixed(2))
          : 0;
      });

      return stats;
    } catch (error) {
      console.error('[FeedbackService] 获取序列统计异常:', error);
      return {};
    }
  }
}

/**
 * 导出单例实例
 */
export const feedbackService = new FeedbackService();
