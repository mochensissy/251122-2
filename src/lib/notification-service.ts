/**
 * 通知服务模块
 *
 * 功能:
 * 1. 封装邮件通知Edge Function调用
 * 2. 支持多种通知类型
 * 3. 自动降级(邮件失败不影响主流程)
 */

import type { UserProfile } from './supabase';

export type NotificationType =
  | 'expert_notification'
  | 'leader_approval'
  | 'employee_feedback'
  | 'expert_rejection';

interface NotificationData {
  question?: string;
  answer?: string;
  rejectionReason?: string;
  askerProfile?: UserProfile;
}

interface NotificationRequest {
  type: NotificationType;
  to: string;
  data: NotificationData;
}

class NotificationService {
  private supabaseUrl: string;
  private supabaseKey: string;
  private enabled: boolean;

  constructor() {
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    this.supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    this.enabled = import.meta.env.VITE_EMAIL_NOTIFICATIONS_ENABLED === 'true';
  }

  /**
   * 通知COE专家 - 员工上报新问题时
   */
  async notifyExpert(
    expertEmail: string,
    question: string,
    askerProfile: UserProfile
  ): Promise<void> {
    await this.sendNotification({
      type: 'expert_notification',
      to: expertEmail,
      data: {
        question,
        askerProfile,
      },
    });
  }

  /**
   * 通知HR领导 - 专家提交答案待审批时
   */
  async notifyLeader(
    leaderEmail: string,
    question: string,
    answer: string,
    askerProfile: UserProfile
  ): Promise<void> {
    await this.sendNotification({
      type: 'leader_approval',
      to: leaderEmail,
      data: {
        question,
        answer,
        askerProfile,
      },
    });
  }

  /**
   * 通知员工 - 问题已获得解答时
   */
  async notifyEmployee(
    employeeEmail: string,
    question: string,
    answer: string
  ): Promise<void> {
    await this.sendNotification({
      type: 'employee_feedback',
      to: employeeEmail,
      data: {
        question,
        answer,
      },
    });
  }

  /**
   * 通知专家 - 答案被驳回时
   */
  async notifyExpertRejection(
    expertEmail: string,
    question: string,
    answer: string,
    rejectionReason: string
  ): Promise<void> {
    await this.sendNotification({
      type: 'expert_rejection',
      to: expertEmail,
      data: {
        question,
        answer,
        rejectionReason,
      },
    });
  }

  /**
   * 发送通知(核心方法)
   */
  private async sendNotification(request: NotificationRequest): Promise<void> {
    if (!this.enabled) {
      console.log('[通知] 邮件通知功能未启用,跳过发送');
      return;
    }

    if (!this.supabaseUrl || !this.supabaseKey) {
      console.error('[通知] Supabase配置缺失');
      return;
    }

    try {
      console.log(`[通知] 发送${request.type}通知到: ${request.to}`);

      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/send-notification-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.supabaseKey}`,
          },
          body: JSON.stringify(request),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.warn(`[通知] 邮件发送失败(非致命): ${data.error || response.statusText}`);
        return;
      }

      if (data.success) {
        console.log(`[通知] 邮件发送成功: ${request.type}`);
      } else {
        console.warn(`[通知] ${data.message || '邮件功能暂不可用'}`);
      }
    } catch (error) {
      console.warn('[通知] 邮件发送异常(非致命):', error);
    }
  }
}

export const notificationService = new NotificationService();
