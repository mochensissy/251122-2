/**
 * 性能监控组件
 *
 * 功能:
 * 1. 显示缓存命中率统计
 * 2. 显示检索性能指标
 * 3. 显示用户反馈统计
 * 4. 实时性能监控
 */

import { useState, useEffect } from 'react';
import { Activity, TrendingUp, Clock, Database, ThumbsUp, Zap } from 'lucide-react';
import { queryCache } from '../lib/rag';
import { feedbackService } from '../lib/feedback-service';
import type { CacheStats } from '../lib/rag';
import type { FeedbackStats } from '../lib/supabase';
import { supabase } from '../lib/supabase';

export default function PerformanceMonitor() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [searchLogs, setSearchLogs] = useState<any[]>([]);

  // 定期更新统计数据
  useEffect(() => {
    const updateStats = async () => {
      // 获取缓存统计
      setCacheStats(queryCache.getStats());

      // 获取反馈统计
      const fbStats = await feedbackService.getStats();
      setFeedbackStats(fbStats);

      // 获取最近的检索日志
      const { data } = await supabase
        .from('search_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) setSearchLogs(data);
    };

    updateStats();
    const interval = setInterval(updateStats, 5000); // 每5秒更新一次

    return () => clearInterval(interval);
  }, []);

  // 计算平均响应时间
  const avgResponseTime = searchLogs.length > 0
    ? searchLogs.reduce((sum, log) => sum + (log.response_time_ms || 0), 0) / searchLogs.length
    : 0;

  return (
    <div className="space-y-6">
      {/* 性能概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 缓存命中率 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">缓存命中率</h3>
            </div>
            <Zap className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-blue-600 mb-1">
            {cacheStats?.hitRate.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-gray-500">
            命中: {cacheStats?.cacheHits || 0} / 总查询: {cacheStats?.totalQueries || 0}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            缓存大小: {cacheStats?.cacheSize || 0} 条
          </div>
        </div>

        {/* 平均响应时间 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">响应速度</h3>
            </div>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-green-600 mb-1">
            {avgResponseTime.toFixed(0)}ms
          </div>
          <div className="text-xs text-gray-500">
            缓存响应: {cacheStats?.averageResponseTime.toFixed(0) || 0}ms
          </div>
          <div className="mt-3 text-xs text-gray-600">
            最近10次查询平均
          </div>
        </div>

        {/* 用户满意度 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">用户满意度</h3>
            </div>
            <Activity className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-purple-600 mb-1">
            {feedbackStats?.satisfaction_rate.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-gray-500">
            满意: {feedbackStats?.positive_count || 0} / 总反馈: {feedbackStats?.total_feedback || 0}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            不满意: {feedbackStats?.negative_count || 0} 条
          </div>
        </div>
      </div>

      {/* 最近检索日志 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-600" />
          最近检索记录
        </h3>

        <div className="space-y-2">
          {searchLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              暂无检索记录
            </div>
          ) : (
            searchLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900 truncate max-w-md">
                    {log.query}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {log.retrieval_method === 'hybrid' ? '混合检索' : '关键词检索'}
                    {' • '}
                    命中 {log.matched_chunks?.length || 0} 个分块
                  </div>
                </div>
                <div className="flex items-center gap-4 ml-4">
                  <div className="text-right">
                    <div className={`text-xs font-medium ${
                      log.response_time_ms < 100 ? 'text-green-600' :
                      log.response_time_ms < 300 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {log.response_time_ms}ms
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 缓存详情 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-gray-600" />
          缓存使用详情
        </h3>

        <div className="space-y-2">
          {queryCache.getCacheDetails().slice(0, 5).map((detail, idx) => (
            <div
              key={detail.key}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-700">
                  查询 #{idx + 1}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  命中次数: {detail.hitCount} 次
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-600">
                  缓存年龄: {detail.age.toFixed(1)}s
                </div>
              </div>
            </div>
          ))}
          {queryCache.getCacheDetails().length === 0 && (
            <div className="text-center text-gray-500 py-8">
              暂无缓存数据
            </div>
          )}
        </div>
      </div>

      {/* 性能建议 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          性能优化建议
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          {cacheStats && cacheStats.hitRate < 50 && (
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>缓存命中率较低（{cacheStats.hitRate.toFixed(1)}%），考虑增加缓存有效期或缓存大小</span>
            </li>
          )}
          {avgResponseTime > 300 && (
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>平均响应时间较慢（{avgResponseTime.toFixed(0)}ms），建议优化数据库索引或启用真实Embedding API</span>
            </li>
          )}
          {feedbackStats && feedbackStats.satisfaction_rate < 70 && (
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-0.5">•</span>
              <span>用户满意度偏低（{feedbackStats.satisfaction_rate.toFixed(1)}%），建议审查负面反馈并优化知识库内容</span>
            </li>
          )}
          {cacheStats && cacheStats.hitRate >= 50 && avgResponseTime <= 300 && feedbackStats && feedbackStats.satisfaction_rate >= 70 && (
            <li className="flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span className="text-green-800">系统性能良好，继续保持！</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
