# 邮件通知功能配置指南

## 功能说明

系统支持以下自动邮件通知场景:

1. **员工上报问题** → 发送邮件给COE专家
2. **专家提交答案** → 发送邮件给HR领导审批
3. **领导批准答案** → 发送邮件通知员工(待实现)
4. **领导驳回答案** → 发送邮件通知专家修改

## 快速启动(无邮件模式)

系统默认禁用邮件功能,所有通知仅在界面显示。无需配置即可正常使用。

```bash
npm run dev
```

## 启用邮件通知

### 第一步: 选择邮件服务

推荐以下邮件服务提供商:

#### 选项1: SendGrid (推荐)
- 免费额度: 100封/天
- 注册: [https://sendgrid.com](https://sendgrid.com)
- 获取API Key后设置SMTP:
  - Host: `smtp.sendgrid.net`
  - Port: `587`
  - User: `apikey`
  - Password: `你的SendGrid API Key`

#### 选项2: 腾讯企业邮箱
- 免费版支持50用户
- SMTP配置:
  - Host: `smtp.exmail.qq.com`
  - Port: `465`
  - User: `your-email@company.com`
  - Password: `你的邮箱密码`

#### 选项3: 阿里云邮件推送
- 按量付费
- SMTP配置:
  - Host: `smtpdm.aliyun.com`
  - Port: `465`
  - User: `你的发信地址`
  - Password: `SMTP密码`

#### 选项4: Gmail (测试用)
- 需要开启"允许不够安全的应用"
- SMTP配置:
  - Host: `smtp.gmail.com`
  - Port: `587`
  - User: `your-gmail@gmail.com`
  - Password: `应用专用密码`

### 第二步: 部署Edge Function

使用Supabase CLI部署邮件通知函数:

```bash
# 确保已安装Supabase CLI并登录
supabase login

# 链接到你的项目
supabase link --project-ref jrynjbgyrmwvkdnmifph

# 设置SMTP环境变量
supabase secrets set SMTP_HOST=smtp.sendgrid.net
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=apikey
supabase secrets set SMTP_PASSWORD=your_sendgrid_api_key
supabase secrets set FROM_EMAIL=noreply@yourcompany.com

# 部署Edge Function
supabase functions deploy send-notification-email
```

### 第三步: 启用邮件通知

修改 `.env` 文件:

```bash
# 将false改为true
VITE_EMAIL_NOTIFICATIONS_ENABLED=true
```

### 第四步: 重启应用

```bash
npm run dev
```

## 验证部署

### 1. 测试Edge Function

使用curl测试邮件发送:

```bash
curl -X POST 'https://jrynjbgyrmwvkdnmifph.supabase.co/functions/v1/send-notification-email' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expert_notification",
    "to": "test@example.com",
    "data": {
      "question": "测试问题",
      "askerProfile": {
        "sequence": "人力资源",
        "level": "P4-P5",
        "role_type": "管理岗"
      }
    }
  }'
```

预期响应:
```json
{
  "success": true,
  "message": "邮件发送成功",
  "type": "expert_notification",
  "to": "test@example.com"
}
```

### 2. 完整流程测试

**测试员工上报通知:**
1. 员工端提出问题:"产假政策是什么?"
2. 点击"上报给COE专家"
3. 检查专家邮箱是否收到通知邮件

**测试领导审批通知:**
1. 专家端回答问题并提交审批
2. 检查领导邮箱是否收到审批请求邮件

**测试驳回通知:**
1. 领导端驳回答案并填写理由
2. 检查专家邮箱是否收到驳回通知邮件

### 3. 观察日志

打开浏览器开发者工具,执行上述操作时应该看到:

```
[通知] 发送expert_notification通知到: expert@company.com
[通知] 邮件发送成功: expert_notification
```

如果邮件功能未配置:
```
[通知] 邮件通知功能未启用,跳过发送
```

## 邮件模板说明

### 1. 专家通知邮件

**主题:** 【新咨询】员工上报职业发展问题

**内容包含:**
- 员工问题内容
- 员工画像(序列/职级/角色)
- 前往专家工作台的链接(占位符)

### 2. 领导审批邮件

**主题:** 【待审批】专家答案需要您的审批

**内容包含:**
- 原始问题
- 专家拟定答案
- 批准/驳回操作按钮(占位符)

### 3. 员工反馈邮件

**主题:** 【已解决】您的咨询问题已获得解答

**内容包含:**
- 原始问题
- 官方解答内容
- 返回智能助手链接(占位符)

### 4. 专家驳回邮件

**主题:** 【需修改】您的答案被领导驳回

**内容包含:**
- 原始问题
- 驳回理由
- 原始答案内容
- 前往修改答案链接(占位符)

## 自定义邮件模板

编辑 `supabase/functions/send-notification-email/index.ts` 中的 `generateEmailTemplate` 函数:

```typescript
function generateEmailTemplate(request: NotificationRequest): EmailTemplate {
  // 修改邮件内容
  return {
    subject: "自定义主题",
    html: "<h1>自定义HTML内容</h1>",
    text: "自定义纯文本内容"
  };
}
```

修改后重新部署:
```bash
supabase functions deploy send-notification-email
```

## 常见问题

### Q: 邮件发送失败怎么办?

A: 系统采用"非致命失败"策略:
- 邮件发送失败不会影响主流程
- 控制台会输出警告日志
- 界面仍会显示操作成功提示

### Q: 如何添加员工邮箱字段?

A: 需要修改数据库和代码:
1. 在 `user_profiles` 表添加 `email` 字段
2. 员工端画像表单添加邮箱输入框
3. 在 `approveTask` 函数中调用 `notificationService.notifyEmployee()`

### Q: 邮件模板不支持HTML?

A: 确保SMTP服务器支持HTML邮件。如果不支持,系统会自动使用纯文本版本。

### Q: 如何限制发送频率?

A: 在Edge Function中添加速率限制:
```typescript
// 使用Supabase存储发送记录
const { data } = await supabaseClient
  .from('email_logs')
  .select('*')
  .eq('to', to)
  .gte('sent_at', new Date(Date.now() - 60000));

if (data && data.length >= 5) {
  throw new Error('发送频率过高,请稍后再试');
}
```

### Q: 成本控制

A: 估算月度成本:
- 100个员工,每人每月上报1次 = 100封
- 专家提交审批 = 100封
- 领导审批通知 = 100封
- **总计**: 约300封/月

使用SendGrid免费版(100封/天)完全够用。

## 生产环境建议

### 1. 使用企业邮箱

不要使用个人邮箱(Gmail/QQ等),会被标记为垃圾邮件。

推荐:
- 企业域名邮箱
- SendGrid/阿里云等专业服务
- 配置SPF/DKIM记录提高送达率

### 2. 设置邮件日志

创建 `email_logs` 表记录所有发送:
```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. 监控发送状态

在Supabase Dashboard → Functions → Logs 中查看函数执行日志。

### 4. 添加重试机制

在Edge Function中添加指数退避重试:
```typescript
let retries = 0;
const maxRetries = 3;

while (retries < maxRetries) {
  try {
    await sendEmail();
    break;
  } catch (error) {
    retries++;
    if (retries >= maxRetries) throw error;
    await sleep(Math.pow(2, retries) * 1000);
  }
}
```

## 进一步优化

1. **邮件队列**: 使用Supabase Realtime实现异步队列
2. **模板引擎**: 集成Handlebars等模板引擎
3. **多语言支持**: 根据用户语言发送不同模板
4. **取消订阅**: 添加退订链接和偏好设置
5. **附件支持**: 支持发送PDF政策文档

## 技术支持

如有问题,请查看:
- [Supabase Edge Functions文档](https://supabase.com/docs/guides/functions)
- [SendGrid SMTP文档](https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api)
- 系统日志(浏览器控制台和Supabase函数日志)
