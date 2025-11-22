/**
 * RAG系统管理组件
 *
 * 功能:
 * 1. 批量文档处理管理
 * 2. 实时进度显示
 * 3. 任务历史查看
 * 4. 系统统计展示
 */

import { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertCircle,
  PlayCircle,
  StopCircle,
  History,
  BarChart3,
  FileText,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { batchProcessor } from '../lib/batch-processor';
import type { BatchProcessResult, BatchTaskStatus } from '../lib/batch-processor';

interface ProcessingStats {
  totalDocs: number;
  processedDocs: number;
  pendingDocs: number;
  totalChunks: number;
}

interface BatchTask {
  id: string;
  status: BatchTaskStatus;
  total_docs: number;
  processed_docs: number;
  failed_docs: number;
  started_at: string;
  completed_at: string;
  created_at: string;
  error_message?: string;
}

export default function RAGManagement() {
  const [stats, setStats] = useState<ProcessingStats>({
    totalDocs: 0,
    processedDocs: 0,
    pendingDocs: 0,
    totalChunks: 0,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [currentDocTitle, setCurrentDocTitle] = useState<string>('');
  const [processingSpeed, setProcessingSpeed] = useState<number>(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number>(0);
  const [processingStartTime, setProcessingStartTime] = useState<number>(0);
  const [taskHistory, setTaskHistory] = useState<BatchTask[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [batchStats, setBatchStats] = useState<any>(null);

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    loadStats();
    loadTaskHistory();
    loadBatchStats();
  }, []);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  async function loadStats() {
    try {
      const { data: allDocs } = await supabase
        .from('knowledge_docs')
        .select('id, is_chunked, chunk_count');

      const { data: chunks } = await supabase.from('document_chunks').select('id');

      if (allDocs) {
        setStats({
          totalDocs: allDocs.length,
          processedDocs: allDocs.filter((d) => d.is_chunked).length,
          pendingDocs: allDocs.filter((d) => !d.is_chunked).length,
          totalChunks: chunks?.length || 0,
        });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function loadTaskHistory() {
    const history = await batchProcessor.getTaskHistory(5);
    setTaskHistory(history);
  }

  async function loadBatchStats() {
    const stats = await batchProcessor.getBatchStats();
    setBatchStats(stats);
  }

  async function handleProcessAllDocuments() {
    if (isProcessing) {
      await batchProcessor.abortProcessing();
      setIsProcessing(false);
      showNotification('info', '批处理任务已中止');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: 0 });
    setProcessingStartTime(Date.now());

    try {
      const result: BatchProcessResult = await batchProcessor.processAllDocuments(
        (current, total, docTitle) => {
          setProcessingProgress({ current, total });
          if (docTitle) {
            setCurrentDocTitle(docTitle);
          }

          // 计算处理速度和预估剩余时间
          if (current > 0) {
            const elapsed = Date.now() - processingStartTime;
            const speed = (current / elapsed) * 1000; // 文档/秒
            const remaining = (total - current) / speed;
            setProcessingSpeed(speed);
            setEstimatedTimeRemaining(remaining);
          }
        }
      );

      await loadStats();
      await loadTaskHistory();
      await loadBatchStats();

      if (result.success) {
        showNotification(
          'success',
          `批处理完成! 成功处理 ${result.processedDocs} 个文档, 耗时 ${(result.duration / 1000).toFixed(1)}秒`
        );
      } else {
        showNotification(
          'error',
          `批处理完成但有 ${result.failedDocs} 个文档失败`
        );
      }
    } catch (error) {
      console.error('Processing failed:', error);
      showNotification('error', '批处理失败: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0 });
      setCurrentDocTitle('');
      setProcessingSpeed(0);
      setEstimatedTimeRemaining(0);
      setProcessingStartTime(0);
    }
  }

  const progressPercentage =
    processingProgress.total > 0
      ? (processingProgress.current / processingProgress.total) * 100
      : 0;

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`p-4 rounded-lg border flex items-center gap-3 ${
            notification.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : notification.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : notification.type === 'error' ? (
            <XCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">RAG 系统管理</h2>
              <p className="text-sm text-gray-500 mt-1">企业级向量检索引擎</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              <History className="w-4 h-4" />
              任务历史
            </button>
            <button
              onClick={handleProcessAllDocuments}
              disabled={isProcessing && processingProgress.total === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                isProcessing
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isProcessing ? (
                <>
                  <StopCircle className="w-4 h-4" />
                  中止处理
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  批量处理文档
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Database} label="文档总数" value={stats.totalDocs} color="blue" />
          <StatCard
            icon={CheckCircle}
            label="已处理"
            value={stats.processedDocs}
            color="green"
          />
          <StatCard icon={Clock} label="待处理" value={stats.pendingDocs} color="orange" />
          <StatCard
            icon={TrendingUp}
            label="分块总数"
            value={stats.totalChunks}
            color="purple"
          />
        </div>

        {isProcessing && processingProgress.total > 0 && (
          <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                <div>
                  <p className="font-medium text-blue-900">正在处理文档...</p>
                  <p className="text-sm text-blue-700">
                    {processingProgress.current} / {processingProgress.total} 完成
                  </p>
                </div>
              </div>
              <span className="text-2xl font-bold text-blue-600">
                {progressPercentage.toFixed(0)}%
              </span>
            </div>

            <div className="w-full bg-blue-200 rounded-full h-3 mb-2 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            {currentDocTitle && (
              <div className="space-y-2 mt-3">
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <FileText className="w-4 h-4" />
                  <span>当前: {currentDocTitle}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-blue-600">
                  <span>
                    处理速度: {processingSpeed.toFixed(2)} 文档/秒
                  </span>
                  {estimatedTimeRemaining > 0 && (
                    <span>
                      预估剩余: {Math.ceil(estimatedTimeRemaining)} 秒
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {batchStats && (
          <div className="mb-6 p-5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">批处理统计</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">总任务数</p>
                <p className="text-2xl font-bold text-gray-900">{batchStats.total_tasks}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">运行中</p>
                <p className="text-2xl font-bold text-blue-600">{batchStats.running_tasks}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">已完成</p>
                <p className="text-2xl font-bold text-green-600">{batchStats.completed_tasks}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">平均耗时</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(batchStats.avg_processing_time_ms / 1000).toFixed(1)}s
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showHistory && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">批处理任务历史</h3>
          {taskHistory.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">暂无任务历史</p>
          ) : (
            <div className="space-y-3">
              {taskHistory.map((task) => (
                <div
                  key={task.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <TaskStatusBadge status={task.status} />
                        <span className="text-sm font-medium text-gray-900">
                          任务 #{task.id.substring(0, 8)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">总数:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {task.total_docs}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">成功:</span>
                          <span className="ml-1 font-medium text-green-600">
                            {task.processed_docs}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">失败:</span>
                          <span className="ml-1 font-medium text-red-600">
                            {task.failed_docs}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">时间:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {new Date(task.created_at).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                      {task.error_message && (
                        <div className="mt-2 text-sm text-red-600 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {task.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">系统特性</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureItem
            title="智能文档分块"
            description="基于语义边界的智能切分，保持上下文连贯性"
          />
          <FeatureItem
            title="向量化检索"
            description="使用1536维向量嵌入，支持语义相似度搜索"
          />
          <FeatureItem
            title="混合检索策略"
            description="70%向量检索 + 30%关键词检索，精准匹配"
          />
          <FeatureItem
            title="高性能批处理"
            description="5个并发任务，智能重试机制，实时进度监控"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'orange' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6" />
        <div>
          <p className="text-sm opacity-80">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: BatchTaskStatus }) {
  const statusConfig = {
    pending: { label: '待处理', className: 'bg-gray-100 text-gray-700' },
    running: { label: '运行中', className: 'bg-blue-100 text-blue-700' },
    completed: { label: '已完成', className: 'bg-green-100 text-green-700' },
    failed: { label: '失败', className: 'bg-red-100 text-red-700' },
    cancelled: { label: '已取消', className: 'bg-orange-100 text-orange-700' },
  };

  const config = statusConfig[status];

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}
