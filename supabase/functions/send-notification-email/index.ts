/**
 * Supabase Edge Function: 发送通知邮件
 *
 * 功能说明:
 * 1. 员工上报问题时,通知COE专家
 * 2. 专家提交答案时,通知HR领导审批
 * 3. 领导审批通过后,通知员工
 * 4. 领导驳回后,通知专家修改
 *
 * API路径: /functions/v1/send-notification-email
 *
 * 请求示例:
 * {
 *   "type": "expert_notification" | "leader_approval" | "employee_feedback" | "expert_rejection",
 *   "to": "recipient@example.com",
 *   "data": {
 *     "question": "员工问题",
 *     "answer": "专家答案",
 *     "rejectionReason": "驳回理由",
 *     "askerProfile": { ... }
 *   }
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationRequest {
  type: "expert_notification" | "leader_approval" | "employee_feedback" | "expert_rejection";
  to: string;
  data: {
    question?: string;
    answer?: string;
    rejectionReason?: string;
    askerProfile?: {
      sequence: string;
      level: string;
      role_type: string;
    };
  };
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function generateEmailTemplate(request: NotificationRequest): EmailTemplate {
  const { type, data } = request;

  switch (type) {
    case "expert_notification":
      return {
        subject: "【新咨询】员工上报职业发展问题",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">新咨询上报通知</h2>
            <p>您好,有一位员工上报了新的职业发展问题,需要您的专业解答。</p>

            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">员工问题</h3>
              <p style="font-size: 16px; line-height: 1.6;">${data.question || "无"}</p>
            </div>

            <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e40af;">员工画像</h3>
              <ul style="list-style: none; padding: 0;">
                <li>🏢 序列: <strong>${data.askerProfile?.sequence || "未知"}</strong></li>
                <li>📊 职级: <strong>${data.askerProfile?.level || "未知"}</strong></li>
                <li>👤 角色: <strong>${data.askerProfile?.role_type || "未知"}</strong></li>
              </ul>
            </div>

            <p style="margin-top: 30px;">请登录系统查看详情并提供专业解答。</p>
            <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 10px;">
              前往专家工作台
            </a>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #6b7280;">
              此邮件由华润啤酒职业发展AI智能体系统自动发送,请勿直接回复。
            </p>
          </div>
        `,
        text: `新咨询上报通知\n\n员工问题: ${data.question}\n\n员工画像:\n- 序列: ${data.askerProfile?.sequence}\n- 职级: ${data.askerProfile?.level}\n- 角色: ${data.askerProfile?.role_type}\n\n请登录系统查看详情。`,
      };

    case "leader_approval":
      return {
        subject: "【待审批】专家答案需要您的审批",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">专家答案待审批</h2>
            <p>您好,COE专家已完成一个咨询问题的解答,需要您审批后发布到知识库。</p>

            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">原始问题</h3>
              <p style="font-size: 16px; line-height: 1.6;">${data.question || "无"}</p>
            </div>

            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #92400e;">专家答案</h3>
              <p style="font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${data.answer || "无"}</p>
            </div>

            <p style="margin-top: 30px; font-weight: bold;">请审核答案内容是否准确、完整、符合公司政策。</p>
            <div style="margin-top: 10px;">
              <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; margin-right: 10px;">
                批准并发布
              </a>
              <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px;">
                驳回修改
              </a>
            </div>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #6b7280;">
              此邮件由华润啤酒职业发展AI智能体系统自动发送,请勿直接回复。
            </p>
          </div>
        `,
        text: `专家答案待审批\n\n原始问题: ${data.question}\n\n专家答案:\n${data.answer}\n\n请登录系统进行审批。`,
      };

    case "employee_feedback":
      return {
        subject: "【已解决】您的咨询问题已获得解答",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">✅ 咨询问题已解决</h2>
            <p>您好,您之前上报的职业发展问题已经得到专业解答,并通过了领导审批。</p>

            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">您的问题</h3>
              <p style="font-size: 16px; line-height: 1.6;">${data.question || "无"}</p>
            </div>

            <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #166534;">官方解答</h3>
              <p style="font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${data.answer || "无"}</p>
            </div>

            <p style="margin-top: 30px;">该答案已加入知识库,您可以随时通过AI助手查询。</p>
            <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 10px;">
              返回智能助手
            </a>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #6b7280;">
              如有其他问题,欢迎继续咨询。此邮件由华润啤酒职业发展AI智能体系统自动发送,请勿直接回复。
            </p>
          </div>
        `,
        text: `咨询问题已解决\n\n您的问题: ${data.question}\n\n官方解答:\n${data.answer}\n\n该答案已加入知识库。`,
      };

    case "expert_rejection":
      return {
        subject: "【需修改】您的答案被领导驳回",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">答案需要修改</h2>
            <p>您好,您提交的答案经领导审核后被驳回,请根据反馈意见进行修改。</p>

            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">原始问题</h3>
              <p style="font-size: 16px; line-height: 1.6;">${data.question || "无"}</p>
            </div>

            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #991b1b;">驳回理由</h3>
              <p style="font-size: 16px; line-height: 1.6;">${data.rejectionReason || "未提供具体理由"}</p>
            </div>

            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #92400e;">您的原答案</h3>
              <p style="font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${data.answer || "无"}</p>
            </div>

            <p style="margin-top: 30px;">请根据驳回理由修改答案,并重新提交审批。</p>
            <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 10px;">
              前往修改答案
            </a>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #6b7280;">
              此邮件由华润啤酒职业发展AI智能体系统自动发送,请勿直接回复。
            </p>
          </div>
        `,
        text: `答案需要修改\n\n原始问题: ${data.question}\n\n驳回理由: ${data.rejectionReason}\n\n您的原答案:\n${data.answer}\n\n请登录系统修改。`,
      };

    default:
      return {
        subject: "系统通知",
        html: "<p>您有新的系统通知。</p>",
        text: "您有新的系统通知。",
      };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = Deno.env.get("SMTP_PORT");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const fromEmail = Deno.env.get("FROM_EMAIL") || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.error("[邮件] SMTP配置缺失");
      return new Response(
        JSON.stringify({
          success: false,
          error: "SMTP配置未完成,邮件功能暂不可用",
          message: "系统已记录通知,但未发送邮件"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const request: NotificationRequest = await req.json();
    const { to, type } = request;

    if (!to || !type) {
      return new Response(
        JSON.stringify({ error: "缺少必需参数: to, type" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[邮件] 准备发送通知: ${type} -> ${to}`);

    const emailTemplate = generateEmailTemplate(request);

    const emailData = {
      from: fromEmail,
      to: to,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    };

    const response = await fetch(`smtp://${smtpHost}:${smtpPort || 587}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${smtpUser}:${smtpPassword}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      throw new Error(`SMTP发送失败: ${response.status}`);
    }

    console.log(`[邮件] 发送成功: ${type} -> ${to}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "邮件发送成功",
        type,
        to,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[邮件] 发送失败:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
