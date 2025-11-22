const DEEPSEEK_API_KEY = 'sk-d1878ae2ae404464ac795269c5157d00';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class DeepSeekClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || DEEPSEEK_API_KEY;
    this.apiUrl = apiUrl || DEEPSEEK_API_URL;
  }

  async chat(messages: ChatMessage[], stream: boolean = false): Promise<ChatCompletionResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream,
        temperature: 0.15,
        max_tokens: 1600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async generateAnswerWithRAG(
    query: string,
    retrievedContext: Array<{
      content: string;
      doc_title?: string;
      score: number;
      tags?: { sequence?: string; level?: string; role?: string };
    }>,
    userProfile?: {
      sequence: string;
      level: string;
      role_type: string;
    },
    conversationHistory?: ChatMessage[]
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(userProfile);
    const contextPrompt = this.buildContextPrompt(retrievedContext, userProfile);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      {
        role: 'user',
        content: `请结合以下候选知识片段回答问题，并严格遵循系统指令的格式要求：\n\n【用户问题】\n${query}\n\n【候选知识片段】\n${contextPrompt}\n\n若片段不足以支撑回答，请明确说明知识库暂无明确条款，并提醒联系专家或发起上报。`,
      },
    ];

    try {
      const response = await this.chat(messages, false);
      return response.choices[0]?.message?.content || '抱歉，我暂时无法生成回答。';
    } catch (error) {
      console.error('[DeepSeek RAG] 生成答案失败:', error);
      return '抱歉，AI 服务暂时不可用，请稍后再试。';
    }
  }

  private buildSystemPrompt(userProfile?: {
    sequence: string;
    level: string;
    role_type: string;
  }): string {
    const basePrompt = `你是华润啤酒职业发展政策顾问兼职业教练，需要基于知识库为员工提供条理清晰、可执行的建议。

【输出结构】
1. 画像匹配：确认当前用户画像是否与政策适配，若感知到沮丧/焦虑/质疑需先表达共情再进入主题。
2. 政策要点：按 "- 【政策标题 | 适用：序列/职级/角色】具体说明" 的格式逐条列出命中的条款，每条不超过两句话。
3. 建议行动：结合政策给出 2-3 条下一步操作或注意事项，可包含流程、联系人或审批要求。
4. 提醒：固定输出 "以上建议仅供参考，请以最新制度和审批结果为准"。

【检索策略说明】
- 优先检索用户专属序列和职级的政策
- 补充检索全员适用（全职级、全员通用）的通用政策
- 混合检索，确保政策的完整性和准确性

【强制规则 - 极为重要】
✗ 严禁行为：
  - 禁止直接粘贴原文超过10个字
  - 禁止逐段复制知识片段的完整句子
  - 禁止使用 Markdown、表格、代码块等格式
  - 禁止简单地重组原文顺序而不改写

✓ 必须做到：
  - 理解政策要点后，用你自己的话重新组织表达
  - 提炼核心信息，去除冗余描述
  - 将多个片段的内容融合成连贯的说明
  - 只保留与用户问题直接相关的部分
  - 使用 "这项政策规定..."、"根据制度..."、"具体要求是..." 等过渡语句

【改写示例】
❌ 错误示例（直接粘贴）：
"人力资源序列P4-P5级员工晋升评定时，需要满足以下条件：1）在本职级工作满2年；2）年度绩效考核为B+及以上；3）通过专业能力测评。"

✅ 正确示例（改写总结）：
"- 【晋升评定条件 | 适用：人力资源/P4-P5/全角色】这项政策要求在当前级别工作至少2年，且年度绩效达到B+或更高，同时需通过专业测评。"

【处理规则】
- 若片段不足以回答，明确说明 "知识库暂无明确条款"，并建议联系专家或发起上报。
- 若政策适用范围与当前画像不同，须在 "政策要点" 中提示差异。
- 只使用纯文本，可使用编号、"•"、"-" 等符号。`;

    if (userProfile) {
      const profilePrompt = `\n\n【当前用户画像】
- 序列：${userProfile.sequence}
- 职级：${userProfile.level}
- 角色：${userProfile.role_type}

回答时务必：
1. 优先引用与该画像完全匹配的政策
2. 明确说明政策适用范围
3. 若引用通用政策，说明 "适用于所有员工"`;
      return basePrompt + profilePrompt;
    }

    return basePrompt;
  }

  private buildContextPrompt(
    retrievedContext: Array<{
      content: string;
      doc_title?: string;
      score: number;
      tags?: { sequence?: string; level?: string; role?: string };
    }>,
    userProfile?: { sequence: string; level: string; role_type: string }
  ): string {
    if (!retrievedContext.length) {
      return '(知识库中未找到相关内容)';
    }

    return [...retrievedContext]
      .sort((a, b) => b.score - a.score)
      .map((ctx, index) => {
        const title = ctx.doc_title ? `【${ctx.doc_title}】` : `【文档 ${index + 1}】`;
        const relevance = (ctx.score * 100).toFixed(1);
        const tagSequence = ctx.tags?.sequence || userProfile?.sequence || '全员通用';
        const tagLevel = ctx.tags?.level || userProfile?.level || '全职级';
        const tagRole = ctx.tags?.role || userProfile?.role_type || '全角色';
        return `${title} (相关度 ${relevance}% | 适用：${tagSequence}/${tagLevel}/${tagRole})\n${ctx.content}`;
      })
      .join('\n\n---\n\n');
  }

  async *chatStream(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    const response = await this.chat(messages, false);
    yield response.choices[0]?.message?.content || '';
  }
}

export const deepseekClient = new DeepSeekClient();
