import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, FileText, Loader2, Sparkles, Database } from 'lucide-react';
import { ragEngine } from '../lib/rag-engine';
import { deepseekClient } from '../lib/deepseek-client';
import type { ChatMessage } from '../lib/deepseek-client';
import type { UserProfile } from '../lib/supabase';
import type { SearchResult } from '../lib/rag-engine';

interface ChatMessageType {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: SearchResult[];
}

interface RAGChatProps {
  userProfile: UserProfile;
}

const MAX_SNIPPET_SENTENCES = 3;
const MAX_SNIPPET_LENGTH = 280;

const splitSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?])/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

const buildSnippet = (text: string): string => {
  const sentences = splitSentences(text);
  let snippet = '';
  for (const sentence of sentences) {
    if ((snippet + sentence).length > MAX_SNIPPET_LENGTH && snippet.length > 0) {
      break;
    }
    snippet += (snippet ? ' ' : '') + sentence;
    if (snippet.split(/[。！？!?]/).length - 1 >= MAX_SNIPPET_SENTENCES) {
      break;
    }
  }
  return snippet || text.slice(0, MAX_SNIPPET_LENGTH);
};

export default function RAGChat({ userProfile }: RAGChatProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSources, setShowSources] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const profileLabel = `${userProfile.sequence}｜${userProfile.level}｜${userProfile.role_type}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const question = inputValue.trim();
    setInputValue('');
    setIsProcessing(true);

    const userMessage: ChatMessageType = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const searchResults = await ragEngine.search(question, userProfile, 5);

      if (searchResults.length === 0) {
        setMessages(prev => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content:
              '抱歉，当前知识库暂未收录与该问题匹配的条款。您可以联系职业发展 COE，或在员工端点击“上报问题”，我们会安排专家尽快补充说明。',
            timestamp: new Date(),
          },
        ]);
        return;
      }

      const context = searchResults.map(result => ({
        content: buildSnippet(result.content),
        doc_title: result.doc_title,
        score: result.score,
        tags: {
          sequence: result.metadata?.doc_sequence,
          level: result.metadata?.doc_level,
          role: result.metadata?.doc_role_type,
        },
      }));

      const history: ChatMessage[] = [...messages, userMessage]
        .slice(-6)
        .map(item => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.content,
        }));

      const answer = await deepseekClient.generateAnswerWithRAG(
        question,
        context,
        userProfile,
        history
      );

      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `根据您提供的个人信息（${profileLabel}），以下建议供参考：\n\n${answer}`,
          timestamp: new Date(),
          sources: searchResults,
        },
      ]);
    } catch (error) {
      console.error('[RAG Chat] 处理失败:', error);
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '抱歉，处理您的问题时出现异常，请稍后重试或联系管理员。',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSources = (messageId: string) => {
    setShowSources(prev => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">AI 职业顾问</h2>
            <p className="text-sm text-gray-500">基于企业知识库的智能问答</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
          <User className="w-4 h-4" />
          <span>序列: {userProfile.sequence}</span>
          <span>｜</span>
          <span>职级: {userProfile.level}</span>
          <span>｜</span>
          <span>角色: {userProfile.role_type}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-blue-100 rounded-full mb-4">
              <Bot className="w-12 h-12 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">欢迎使用 AI 职业顾问</h3>
            <p className="text-gray-600 max-w-md">
              输入您的职业发展问题，我会结合企业知识库条款和专家经验，给出分点式建议。
            </p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
              )}

              <div
                className={`flex flex-col max-w-3xl ${message.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-900 shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                </div>

                <span className="text-xs text-gray-400 mt-1 px-2">
                  {message.timestamp.toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>

                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-2 w-full">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Database className="w-3 h-3" />
                      {showSources[message.id] ? '隐藏' : '查看'}参考来源 ({message.sources.length})
                    </button>

                    {showSources[message.id] && (
                      <div className="mt-2 space-y-2">
                        {message.sources.map((source, idx) => {
                          // 判断是否为通用制度
                          const isUniversal =
                            source.metadata?.doc_sequence === '全员通用' &&
                            source.metadata?.doc_level === '全职级' &&
                            source.metadata?.doc_role_type === '全角色';

                          // 判断是否完全匹配当前用户画像
                          const isExactMatch =
                            source.metadata?.doc_sequence === userProfile.sequence &&
                            source.metadata?.doc_level === userProfile.level &&
                            source.metadata?.doc_role_type === userProfile.role_type;

                          return (
                            <div key={source.chunk_id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-400" />
                                    <span className="font-medium text-gray-700">
                                      {source.doc_title || `文档 ${idx + 1}`}
                                    </span>
                                    {/* 类型标签：通用 vs 专属 */}
                                    {isUniversal ? (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">
                                        通用制度
                                      </span>
                                    ) : isExactMatch ? (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-medium">
                                        完全匹配
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-medium">
                                        部分匹配
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
                                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full">
                                      序列: {source.metadata?.doc_sequence || '全员通用'}
                                    </span>
                                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full">
                                      职级: {source.metadata?.doc_level || '全职级'}
                                    </span>
                                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full">
                                      角色: {source.metadata?.doc_role_type || '全角色'}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-gray-500 flex-shrink-0">相关度 {(source.score * 100).toFixed(1)}%</span>
                              </div>
                              <p className="text-gray-600 line-clamp-3">{source.content}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
              )}
            </div>
          ))
        )}

        {isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="px-4 py-3 bg-white border border-gray-200 rounded-2xl">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-gray-600">正在整理回答…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="请描述您的晋升、任职或培养问题…"
            disabled={isProcessing}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            <span>发送</span>
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-2 text-center">
          AI 回答基于企业知识库生成，建议仅供参考，请以最新制度与审批结果为准。
        </p>
      </div>
    </div>
  );
}
