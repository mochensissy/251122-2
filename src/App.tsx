import { useState, useEffect, useRef } from 'react';
import {
  User,
  Briefcase,
  Send,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  FileText,
  Settings,
  Users,
  Mail,
  LogOut,
  XCircle,
  Bell,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type {
  UserProfile,
  Message,
  KnowledgeDoc,
  EscalationTask,
  SystemSettings,
} from './lib/supabase';
import { searchKnowledge, detectEmotion, getEmpathyPrefix, queryCache } from './lib/rag';
import { notificationService } from './lib/notification-service';
import FileUploader from './components/FileUploader';
import DocumentList from './components/DocumentList';
import PerformanceMonitor from './components/PerformanceMonitor';
import RAGChat from './components/RAGChat';

const ANONYMOUS_USER_ID = 'anonymous_user';

const DEFAULT_SETTINGS: SystemSettings = {
  expert_email: 'expert.coe@crbeer.com',
  leader_email: 'hr.leader@crbeer.com',
  sla_text: '预计 5 个工作日内反馈',
  contact_text: '如需及时解答，请通过“润工作”搜索职业发展COE或拨打热线 888-1234。',
  employee_feedback_email: '',
};

type UserRole = 'employee' | 'expert' | 'leader';
type AppRole = UserRole | 'admin';
type ExpertView = 'tasks' | 'knowledge' | 'performance' | 'settings' | 'assistant';

const ROLE_LABELS: Record<AppRole, string> = {
  employee: '员工端',
  expert: '专家端',
  leader: '领导审批',
  admin: '管理员模式',
};

function App() {
  const [appRole, setAppRole] = useState<AppRole | null>(() => {
    const stored = localStorage.getItem('APP_ROLE');
    return stored ? (stored as AppRole) : null;
  });
  const [currentRole, setCurrentRole] = useState<UserRole>('employee');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showEscalateOption, setShowEscalateOption] = useState(false);
  const [lastUnansweredQuery, setLastUnansweredQuery] = useState('');

  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [tasks, setTasks] = useState<EscalationTask[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({ ...DEFAULT_SETTINGS });

  const [expertView, setExpertView] = useState<ExpertView>('tasks');
  const [editingTask, setEditingTask] = useState<EscalationTask | null>(null);
  const [expertAnswerDraft, setExpertAnswerDraft] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [expertPersona, setExpertPersona] = useState<UserProfile>({
    sequence: '人力资源',
    level: '经理层',
    role_type: '个人贡献者/BP',
  });

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'warning';
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appRole) {
      localStorage.setItem('APP_ROLE', appRole);
    } else {
      localStorage.removeItem('APP_ROLE');
    }
  }, [appRole]);

  const isAdminMode = appRole === 'admin';
  const effectiveRole: UserRole = isAdminMode ? currentRole : (appRole ?? 'employee');
  const roleLabel = ROLE_LABELS[appRole ?? 'employee'];

  // 初始化时尝试加载已保存的用户画像
  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('sequence, level, role_type, contact_email, updated_at')
        .eq('user_id', ANONYMOUS_USER_ID)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('[Profile] 加载已保存画像失败:', error.message);
        return;
      }

      const latestProfile = data?.[0];
      if (latestProfile) {
        setProfile({
          sequence: latestProfile.sequence,
          level: latestProfile.level,
          role_type: latestProfile.role_type,
          contact_email: latestProfile.contact_email || undefined,
        });
      }
    };

    loadProfile();
  }, []);

  // 加载知识库文档
  useEffect(() => {
    const loadDocs = async () => {
      const { data } = await supabase.from('knowledge_docs').select('*');
      if (data) setDocs(data);
    };
    loadDocs();
  }, []);

  // 加载用户对话历史
  useEffect(() => {
    const loadConversations = async () => {
      if (!profile) return;
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', ANONYMOUS_USER_ID)
        .order('created_at', { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        const loadedMessages: Message[] = data.map((conv) => ({
          id: conv.id,
          role: conv.role as 'user' | 'ai',
          content: conv.content,
          sources: Array.isArray(conv.sources) ? conv.sources : [],
          timestamp: new Date(conv.created_at || '').getTime(),
        }));
        setMessages(loadedMessages);
      }
    };
    loadConversations();
  }, [profile]);

  // 加载任务
  useEffect(() => {
    const loadTasks = async () => {
      const { data } = await supabase.from('escalation_tasks').select('*').order('created_at', { ascending: false });
      if (data) setTasks(data);
    };
    loadTasks();
  }, []);

  // 加载系统配置
  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase.from('system_settings').select('*');
      if (data && data.length > 0) {
        const settingsObj = data.reduce((acc, item) => {
          acc[item.key as keyof SystemSettings] = item.value;
          return acc;
        }, {} as Partial<SystemSettings>);
        setSettings((prev) => ({
          ...prev,
          ...settingsObj,
        }));
      }
    };
    loadSettings();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAppRoleSelect = (role: AppRole) => {
    setAppRole(role);
    if (role !== 'admin') {
      setCurrentRole(role);
    }
  };

  const handleLogout = () => {
    setAppRole(null);
    setCurrentRole('employee');
    setExpertView('tasks');
  };

  const updateExpertPersona = (field: keyof UserProfile, value: string) => {
    setExpertPersona((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleResetProfile = async () => {
    await supabase.from('user_profiles').delete().eq('user_id', ANONYMOUS_USER_ID);
    setProfile(null);
    setMessages([]);
    setCurrentRole('employee');
    showToast('已重置画像信息，请重新填写', 'info');
  };

  const handleOnboarding = async (newProfile: UserProfile) => {
    setProfile(newProfile);
    await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: ANONYMOUS_USER_ID,
          ...newProfile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    const welcomeMsg: Message = {
      id: 'welcome',
      role: 'ai',
      content: `您好！我是您的职业发展智能助手。\n\n我已经记录您的身份信息：\n- **${newProfile.sequence}序列**\n- 职级 **${newProfile.level}** (${newProfile.role_type})\n\n请问有什么关于晋升、绩效或发展的政策问题可以帮您？`,
      timestamp: Date.now(),
    };

    setMessages([welcomeMsg]);

    await supabase.from('conversations').insert({
      user_id: ANONYMOUS_USER_ID,
      role: welcomeMsg.role,
      content: welcomeMsg.content,
      sources: welcomeMsg.sources || [],
    });
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !profile) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setShowEscalateOption(false);

    setTimeout(async () => {
      const isEmpathy = detectEmotion(userMsg.content);
      const matches = await searchKnowledge(userMsg.content, profile, docs);

      let aiContent = '';
      let sources: string[] = [];

      if (matches.length > 0) {
        // 收集所有来源（去重）
        sources = [...new Set(matches.map(m => m.title))];

        // 构建回答内容
        if (isEmpathy) {
          const empathyPrefix = getEmpathyPrefix(isEmpathy);
          aiContent = `${empathyPrefix}\n\n根据公司政策，相关解决路径如下：\n\n`;
        }

        // 格式化内容：清理 Markdown 和优化排版
        const formatContent = (content: string): string => {
          return content
            .replace(/\*\*(.+?)\*\*/g, '$1')  // 移除加粗标记
            .replace(/#{1,6}\s/g, '')  // 移除标题符号
            .replace(/\n{3,}/g, '\n\n')  // 合并多余空行
            .trim();
        };

        // 如果只有一个结果，直接显示
        if (matches.length === 1) {
          aiContent += formatContent(matches[0].content);
        } else {
          // 多个结果时，显示最相关的前2个分块
          aiContent += '以下是与您的问题最相关的政策说明：\n\n';
          matches.slice(0, 2).forEach((match, index) => {
            const formattedContent = formatContent(match.content);
            aiContent += `【相关片段 ${index + 1}】\n${formattedContent}\n\n`;
            if (index < matches.length - 1) {
              aiContent += '---\n\n';  // 分隔线
            }
          });
        }

        // 添加来源信息
        const isRAGSearch = matches[0].is_chunked;
        aiContent += `\n📚 信息来源：${sources.join('、')}`;
        aiContent += `\n🔍 检索方式：${isRAGSearch ? 'RAG智能向量检索' : '传统关键词检索'}（找到${matches.length}个相关片段）`;

        if (aiContent.includes('建议') || matches[0].doc_type === 'policy') {
          aiContent +=
            '\n\n💡 免责声明：以上回答基于现有制度库生成，仅供参考。具体执行请以公司正式发文为准。';
        }
      } else {
        setLastUnansweredQuery(userMsg.content);
        setShowEscalateOption(true);
        aiContent = isEmpathy
          ? '我能感受到您的困扰，但我暂时在当前的制度库中找不到针对您这种情况的确切条款。为了不给您错误的建议，建议您直接咨询 COE 专家，好吗？'
          : '抱歉，我在当前的知识库中没有找到与您的问题完全匹配的政策说明。您可以选择将此问题上报给 COE 专家进行解答。';
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiContent,
        timestamp: Date.now(),
        sources,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);

    await supabase.from('conversations').insert([
      {
        user_id: ANONYMOUS_USER_ID,
        role: userMsg.role,
        content: userMsg.content,
        sources: [],
      },
      {
        user_id: ANONYMOUS_USER_ID,
        role: aiMsg.role,
        content: aiMsg.content,
        sources: aiMsg.sources || [],
        },
      ]);
    }, 800);
  };

  const handleEscalate = async () => {
    if (!profile) return;

    const { data, error } = await supabase
      .from('escalation_tasks')
      .insert({
        question: lastUnansweredQuery,
        asker_profile: profile,
        status: 'pending_expert',
        history: messages,
      })
      .select();

    if (!error && data) {
      if (data.length > 0) {
        setTasks((prev) => {
          const existingIds = new Set(prev.map((task) => task.id));
          const newTasks = data.filter((task) => !existingIds.has(task.id));
          return [...newTasks, ...prev];
        });
      }
      const slaText = settings.sla_text || DEFAULT_SETTINGS.sla_text;
      await notificationService.notifyExpert(
        settings.expert_email,
        lastUnansweredQuery,
        profile
      );

      showToast(`已通知专家 (${settings.expert_email})`, 'info');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'ai',
          content: `✅ 您的问题已成功上报给 COE 专家团队。\n\n${slaText}。一旦专家审核通过并更新知识库，您将收到通知。`,
          timestamp: Date.now(),
        },
      ]);
      setShowEscalateOption(false);
    }
  };

  const submitExpertAnswer = async (taskId: string) => {
    if (!expertAnswerDraft) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    await supabase
      .from('escalation_tasks')
      .update({
        status: 'pending_approval',
        expert_answer: expertAnswerDraft,
      })
      .eq('id', taskId);

    await notificationService.notifyLeader(
      settings.leader_email,
      task.question,
      expertAnswerDraft,
      task.asker_profile
    );

    showToast(`已发送审批请求至 (${settings.leader_email})`, 'info');
    setEditingTask(null);
    setExpertAnswerDraft('');

    const { data } = await supabase.from('escalation_tasks').select('*').order('created_at', { ascending: false });
    if (data) setTasks(data);
  };

  const approveTask = async (task: EscalationTask) => {
    if (!task.expert_answer) return;

    await supabase
      .from('escalation_tasks')
      .update({ status: 'approved' })
      .eq('id', task.id);

    await supabase.from('knowledge_docs').insert({
      title: `Q&A: ${task.question.substring(0, 30)}...`,
      content: task.expert_answer,
      tag_sequence: task.asker_profile.sequence,
      tag_level: task.asker_profile.level,
      tag_role_type: task.asker_profile.role_type,
      doc_type: 'qa',
    });

    // 新文档添加后,清除所有查询缓存
    queryCache.clear();
    console.log('[Cache] 审批通过,新Q&A已入库,已清空所有查询缓存');

    const employeeEmail =
      task.asker_profile?.contact_email || settings.employee_feedback_email || '';
    if (employeeEmail) {
      await notificationService.notifyEmployee(employeeEmail, task.question, task.expert_answer);
    }

    showToast(
      employeeEmail ? '知识库已更新，反馈邮件已发送' : '知识库已更新（无可用员工邮箱，已跳过反馈邮件）',
      employeeEmail ? 'success' : 'info'
    );

    const { data: docsData } = await supabase.from('knowledge_docs').select('*');
    if (docsData) setDocs(docsData);

    const { data: tasksData } = await supabase.from('escalation_tasks').select('*').order('created_at', { ascending: false });
    if (tasksData) setTasks(tasksData);
  };

  const rejectTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    await supabase
      .from('escalation_tasks')
      .update({ status: 'rejected', leader_comment: rejectReason })
      .eq('id', taskId);

    await notificationService.notifyExpertRejection(
      settings.expert_email,
      task.question,
      task.expert_answer || '',
      rejectReason
    );

    setEditingTask(null);
    setRejectReason('');
    showToast('驳回通知已发送给专家', 'info');

    const { data } = await supabase.from('escalation_tasks').select('*').order('created_at', { ascending: false });
    if (data) setTasks(data);
  };

  const renderIdentityBadge = () => (
    <div className="flex items-center gap-3 bg-white/90 backdrop-blur shadow-lg rounded-full px-3 py-1.5 border border-gray-200 text-xs text-slate-600">
      <span className="font-medium">{roleLabel}</span>
      <button
        onClick={handleLogout}
        className="px-2 py-0.5 text-slate-500 hover:text-slate-900 transition-colors"
      >
        切换身份
      </button>
    </div>
  );

  const renderRoleSwitcher = () => {
    if (!isAdminMode) {
      return renderIdentityBadge();
    }

    return (
      <div className="flex items-center gap-2 bg-white/90 backdrop-blur shadow-lg rounded-full p-1 border border-gray-200">
        {(['employee', 'expert', 'leader'] as const).map((role) => (
          <button
            key={role}
            onClick={() => setCurrentRole(role)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              currentRole === role
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {role === 'employee' ? '员工端' : role === 'expert' ? '专家端' : '领导审批'}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <button
          onClick={() => {
            if (confirm('确定要重置画像信息并重新填写吗？')) {
              handleResetProfile();
            }
          }}
          title="重置员工画像"
          className="p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-full transition-colors"
        >
          <XCircle className="w-4 h-4" />
        </button>
        <button
          onClick={handleLogout}
          title="退出管理员模式"
          className="p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const roleOptions: Array<{ role: AppRole; title: string; description: string }> = [
    { role: 'employee', title: '员工端', description: '填写个人画像，与 AI 职业顾问进行对话' },
    { role: 'expert', title: '专家端', description: '处理上报咨询、管理知识库并体验员工提问' },
    { role: 'leader', title: '领导审批', description: '查看专家提交的答案并进行审批/驳回' },
    { role: 'admin', title: '管理员模式', description: '调试用途，可在同一界面切换全部角色' },
  ];

  const renderRoleSelection = () => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-10">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">请选择您的入口</h1>
          <p className="text-slate-500 text-sm">
            不同身份对应不同权限。管理员模式仅用于平台调试，普通用户请选择自己的真实身份。
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roleOptions.map((option) => (
            <button
              key={option.role}
              onClick={() => handleAppRoleSelect(option.role)}
              className="text-left border border-slate-200 rounded-xl p-6 hover:border-blue-500 hover:shadow-lg transition-all bg-white"
            >
              <p className="text-sm text-slate-400 mb-1">入口</p>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">{option.title}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Toast通知
  const renderToast = () =>
    toast && (
      <div
        className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-lg flex items-center gap-3 z-[100] animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success'
            ? 'bg-green-600'
            : toast.type === 'info'
            ? 'bg-blue-600'
            : 'bg-orange-500'
        } text-white`}
      >
        {toast.type === 'success' ? (
          <CheckCircle className="w-5 h-5" />
        ) : toast.type === 'info' ? (
          <Mail className="w-5 h-5" />
        ) : (
          <AlertCircle className="w-5 h-5" />
        )}
        <span className="font-medium">{toast.message}</span>
      </div>
    );

  if (!appRole) {
    return renderRoleSelection();
  }

  // 员工端 - 用户画像收集
  if (effectiveRole === 'employee' && !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="fixed top-4 right-4 z-50">{renderRoleSwitcher()}</div>
        {renderToast()}
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 text-center">职业发展十万个为什么</h1>
            <p className="text-lg font-bold text-slate-600 mt-1 text-center">AI政策解答超级助手</p>
            <p className="text-slate-500 mt-2 text-center">为了给您提供最准确的政策解答，请先确认您的基本信息。</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const contactEmail = (fd.get('contactEmail') as string)?.trim();
              handleOnboarding({
                sequence: fd.get('sequence') as string,
                level: fd.get('level') as string,
                role_type: fd.get('roleType') as string,
                contact_email: contactEmail ? contactEmail : undefined,
              });
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">角色类型</label>
              <select
                name="roleType"
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="基层">基层</option>
                <option value="经理层">经理层</option>
                <option value="专业总监">专业总监</option>
                <option value="干部">干部</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">专业序列</label>
              <select
                name="sequence"
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="市场（营销）">市场（营销）</option>
                <option value="市场（销售）">市场（销售）</option>
                <option value="供应链（生产）">供应链（生产）</option>
                <option value="供应链（采购）">供应链（采购）</option>
                <option value="供应链（营运）">供应链（营运）</option>
                <option value="财务管理">财务管理</option>
                <option value="人力资源">人力资源</option>
                <option value="智能与数字化">智能与数字化</option>
                <option value="战略管理">战略管理</option>
                <option value="行政管理">行政管理</option>
                <option value="研发">研发</option>
                <option value="党群">党群</option>
                <option value="纪检">纪检</option>
                <option value="法律合规">法律合规</option>
                <option value="EHS">EHS</option>
                <option value="审计">审计</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                联系邮箱 <span className="text-slate-400 text-xs">(选填)</span>
              </label>
              <input
                type="email"
                name="contactEmail"
                placeholder="you@example.com"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              开启咨询对话 <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 员工端 - 对话界面
  if (effectiveRole === 'employee' && profile) {
    return (
      <div className="flex flex-col h-screen bg-slate-50">
        <div className="fixed top-4 right-4 z-50">{renderRoleSwitcher()}</div>
        {renderToast()}

        {/* 顶部栏 */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-md">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800">职业发展智能助手</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                  {profile.sequence}
                </span>
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                  {profile.level}
                </span>
              </div>
            </div>
          </div>
          {!isAdminMode && (
            <button
              onClick={() => {
                if (confirm('确定要重置画像信息并重新填写吗？')) {
                  handleResetProfile();
                }
              }}
              className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
            >
              重置画像
            </button>
          )}
        </header>

        {/* 对话区域 */}
        <main className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200/50 text-xs opacity-75 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> 参考来源: {msg.sources.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {showEscalateOption && (
            <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-4 rounded-xl shadow-md border border-orange-100 max-w-md w-full">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-orange-500 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-slate-800 mb-1">需要更多帮助？</h3>
                    <p className="text-sm text-slate-600 mb-3">AI 没能找到最匹配的答案。您可以选择将此问题升级给真人专家。</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleEscalate}
                        className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        上报给 COE 专家
                      </button>
                      <button
                        onClick={() => {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: Date.now().toString(),
                              role: 'ai',
                              content: settings.contact_text || DEFAULT_SETTINGS.contact_text,
                              timestamp: Date.now(),
                            },
                          ]);
                          setShowEscalateOption(false);
                        }}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg font-medium transition-colors"
                      >
                        查看联系方式
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 输入框 */}
        <div className="bg-white border-t border-slate-200 p-4">
          <div className="max-w-4xl mx-auto relative flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="询问关于晋升、绩效、申诉政策..."
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isTyping}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <div className="text-center mt-2">
            <p className="text-[10px] text-slate-400">AI 回答仅供参考，请以公司正式发布的红头文件为准。</p>
          </div>
        </div>
      </div>
    );
  }

  // 专家端
  if (effectiveRole === 'expert') {
    const pendingTasks = tasks.filter((t) => t.status === 'pending_expert' || t.status === 'rejected');

    return (
      <div className="min-h-screen bg-slate-50">
        {renderToast()}

        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">COE 专家工作台</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setExpertView('tasks')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  expertView === 'tasks' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                待办任务
              </button>
              <button
                onClick={() => setExpertView('knowledge')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  expertView === 'knowledge' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                知识库管理
              </button>
              <button
                onClick={() => setExpertView('assistant')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  expertView === 'assistant' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                员工问答
              </button>
              <button
                onClick={() => setExpertView('performance')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  expertView === 'performance' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                性能监控
              </button>
              <button
                onClick={() => setExpertView('settings')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  expertView === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                系统设置
              </button>
            </div>
            {renderRoleSwitcher()}
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Bell className="w-4 h-4" />
              <span>{pendingTasks.length} 个待处理</span>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-8">
          {expertView === 'tasks' && (
            <>
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-700">员工咨询待办队列</h2>
              </div>
              <div className="grid gap-4">
                {pendingTasks.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">所有咨询都已处理完毕。</p>
                  </div>
                ) : (
                  pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all hover:shadow-md"
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase tracking-wider mb-2 ${
                                task.status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {task.status === 'rejected' ? '被领导驳回' : '新咨询上报'}
                            </span>
                            <h3 className="text-lg font-semibold text-slate-900">{task.question}</h3>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-400 mb-1">提问者画像</div>
                            <div className="text-sm font-medium text-slate-700 flex items-center gap-2 justify-end">
                              <span className="bg-slate-100 px-2 py-0.5 rounded">{task.asker_profile.sequence}</span>
                              <span className="bg-slate-100 px-2 py-0.5 rounded">{task.asker_profile.level}</span>
                            </div>
                          </div>
                        </div>

                        {task.status === 'rejected' && task.leader_comment && (
                          <div className="bg-red-50 border border-red-100 p-3 rounded-lg mb-4 flex gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-red-800">驳回理由:</p>
                              <p className="text-sm text-red-700">{task.leader_comment}</p>
                            </div>
                          </div>
                        )}

                        {editingTask?.id === task.id ? (
                          <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                            <label className="block text-sm font-medium text-slate-700 mb-2">撰写标准答案</label>
                            <textarea
                              value={expertAnswerDraft}
                              onChange={(e) => setExpertAnswerDraft(e.target.value)}
                              className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-3 bg-white"
                              placeholder="请输入官方政策解答..."
                            />
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => setEditingTask(null)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => submitExpertAnswer(task.id)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                              >
                                提交领导审批 <Send className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end mt-2">
                            <button
                              onClick={() => {
                                setEditingTask(task);
                                setExpertAnswerDraft(task.expert_answer || '');
                              }}
                              className="px-4 py-2 border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors text-sm"
                            >
                              开始解答
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {expertView === 'knowledge' && (
            <>
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">文件上传</h2>
                <FileUploader
                  onUploadComplete={async () => {
                    const { data } = await supabase.from('knowledge_docs').select('*');
                    if (data) setDocs(data);
                    showToast('文件上传成功', 'success');
                  }}
                />
              </div>

              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700 mb-4">文档列表</h2>
                <DocumentList
                  onUpdate={async () => {
                    const { data } = await supabase.from('knowledge_docs').select('*');
                    if (data) setDocs(data);
                  }}
                />
              </div>
            </>
          )}

          {expertView === 'assistant' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">模拟员工画像</h2>
                <p className="text-sm text-slate-500 mb-4">
                  调整画像信息以模拟不同序列/职级的员工提问场景。
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">角色类型</label>
                    <select
                      value={expertPersona.level}
                      onChange={(e) => updateExpertPersona('level', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="基层">基层</option>
                      <option value="经理层">经理层</option>
                      <option value="专业总监">专业总监</option>
                      <option value="干部">干部</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">专业序列</label>
                    <select
                      value={expertPersona.sequence}
                      onChange={(e) => updateExpertPersona('sequence', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="市场（营销）">市场（营销）</option>
                      <option value="市场（销售）">市场（销售）</option>
                      <option value="供应链（生产）">供应链（生产）</option>
                      <option value="供应链（采购）">供应链（采购）</option>
                      <option value="供应链（营运）">供应链（营运）</option>
                      <option value="财务管理">财务管理</option>
                      <option value="人力资源">人力资源</option>
                      <option value="智能与数字化">智能与数字化</option>
                      <option value="战略管理">战略管理</option>
                      <option value="行政管理">行政管理</option>
                      <option value="研发">研发</option>
                      <option value="党群">党群</option>
                      <option value="纪检">纪检</option>
                      <option value="法律合规">法律合规</option>
                      <option value="EHS">EHS</option>
                      <option value="审计">审计</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[640px]">
                <RAGChat userProfile={expertPersona} />
              </div>
            </div>
          )}

          {expertView === 'performance' && (
            <>
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-700">系统性能监控</h2>
                <p className="text-sm text-slate-500 mt-1">实时监控检索性能、缓存效率和用户满意度</p>
              </div>
              <PerformanceMonitor />
            </>
          )}

          {expertView === 'settings' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5" /> 系统配置
              </h2>
            <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);

                  await supabase.from('system_settings').upsert([
                    { key: 'expert_email', value: formData.get('expertEmail') as string },
                    { key: 'leader_email', value: formData.get('leaderEmail') as string },
                    { key: 'sla_text', value: formData.get('slaText') as string },
                    { key: 'contact_text', value: formData.get('contactText') as string },
                    { key: 'employee_feedback_email', value: (formData.get('employeeFeedbackEmail') as string) || '' }
                  ], { onConflict: 'key' });

                  showToast('系统配置已更新', 'success');

                  const { data } = await supabase.from('system_settings').select('*');
                  if (data && data.length > 0) {
                    const settingsObj = data.reduce((acc, item) => {
                      acc[item.key as keyof SystemSettings] = item.value;
                      return acc;
                    }, {} as Partial<SystemSettings>);
                    setSettings((prev) => ({
                      ...prev,
                      ...settingsObj,
                    }));
                  }
                }}
              className="max-w-lg space-y-6"
            >
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">COE 专家通知邮箱</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input
                      name="expertEmail"
                      defaultValue={settings.expert_email}
                      className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">员工上报问题时，将发送通知至此邮箱。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">HR 领导审批邮箱</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input
                      name="leaderEmail"
                      defaultValue={settings.leader_email}
                      className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">专家提交答案后，将发送审批请求至此邮箱。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">服务承诺文案 (SLA)</label>
                  <input
                    name="slaText"
                    defaultValue={settings.sla_text}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">展示给员工的预计反馈时间提示。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系专家话术</label>
                  <textarea
                    name="contactText"
                    defaultValue={settings.contact_text}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={3}
                  />
                  <p className="text-xs text-slate-500 mt-1">员工选择“联系专家”时展示的固定话术。</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">员工反馈通知邮箱 (可选)</label>
                  <input
                    type="email"
                    name="employeeFeedbackEmail"
                    defaultValue={settings.employee_feedback_email || ''}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">如用户画像未填写邮箱，将使用该地址接收审批通过通知。</p>
                </div>
              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> 保存配置
              </button>
            </form>
          </div>
          )}
        </main>
      </div>
    );
  }

  // 领导端
  if (effectiveRole === 'leader') {
    const tasksForApproval = tasks.filter((t) => t.status === 'pending_approval');

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="fixed top-4 right-4 z-50">{renderRoleSwitcher()}</div>
        {renderToast()}

        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">HR 领导审批中心</h1>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <span className="font-medium bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-sm">
              {tasksForApproval.length} 个待审批
            </span>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-6">新知识入库审批队列</h2>
          {tasksForApproval.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">目前没有需要审批的条目。</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {tasksForApproval.map((task) => (
                <div key={task.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{task.question}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>来源画像:</span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {task.asker_profile.sequence}
                      </span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {task.asker_profile.level}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 bg-blue-50/50">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">专家拟定答案</p>
                    <div className="text-slate-800 whitespace-pre-wrap bg-white p-4 rounded-lg border border-blue-100">
                      {task.expert_answer}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 flex items-center justify-between">
                    <div className="text-xs text-slate-400">审批通过后，该问答将立即更新至 AI 知识库。</div>
                    <div className="flex gap-3">
                      {editingTask?.id === task.id ? (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right-5">
                          <input
                            type="text"
                            placeholder="驳回理由..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="px-3 py-2 border border-red-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-red-500 outline-none"
                          />
                          <button
                            onClick={() => rejectTask(task.id)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            确认驳回
                          </button>
                          <button
                            onClick={() => setEditingTask(null)}
                            className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingTask(task)}
                            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium text-sm transition-colors"
                          >
                            驳回
                          </button>
                          <button
                            onClick={() => approveTask(task)}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm shadow-sm transition-colors flex items-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4" /> 批准并发布
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
      加载系统中...
    </div>
  );
}

export default App;
