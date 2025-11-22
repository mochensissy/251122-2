/**
 * 查询缓存服务
 *
 * 功能:
 * 1. LRU缓存机制 - 自动淘汰最少使用的缓存
 * 2. TTL过期策略 - 自动清理过期缓存
 * 3. 智能缓存键 - 基于查询+用户画像生成唯一键
 * 4. 统计分析 - 追踪缓存命中率
 */

import type { UserProfile, KnowledgeDoc } from './supabase';

/**
 * 缓存条目接口
 */
interface CacheEntry {
  results: KnowledgeDoc[];
  timestamp: number;
  hitCount: number;
  profile: UserProfile;
}

/**
 * 缓存统计接口
 */
export interface CacheStats {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  cacheSize: number;
  averageResponseTime: number;
}

/**
 * 查询缓存配置
 */
interface CacheConfig {
  maxSize: number;        // 最大缓存条目数
  ttlMinutes: number;     // 缓存有效期(分钟)
  enableStats: boolean;   // 是否启用统计
}

/**
 * LRU查询缓存
 */
export class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private config: CacheConfig;

  // 统计数据
  private stats = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    responseTimes: [] as number[],
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 100,
      ttlMinutes: config.ttlMinutes || 10,
      enableStats: config.enableStats !== false,
    };

    // 启动定期清理任务
    this.startCleanupTask();
  }

  /**
   * 生成缓存键
   * 格式: query_hash:sequence:level:role_type
   */
  private generateCacheKey(query: string, profile: UserProfile): string {
    const normalizedQuery = this.normalizeQuery(query);
    const queryHash = this.simpleHash(normalizedQuery);
    return `${queryHash}:${profile.sequence}:${profile.level}:${profile.role_type}`;
  }

  /**
   * 标准化查询(去除空格、标点、大小写)
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[?!。?!、,]/g, '');
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 检查缓存是否有效
   */
  private isValid(entry: CacheEntry): boolean {
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000 / 60; // 转换为分钟
    return age < this.config.ttlMinutes;
  }

  /**
   * 更新访问顺序(LRU)
   */
  private updateAccessOrder(key: string): void {
    // 移除旧位置
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    // 添加到末尾(最新访问)
    this.accessOrder.push(key);
  }

  /**
   * 淘汰最少使用的缓存
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder.shift()!;
    this.cache.delete(lruKey);
    console.log(`[QueryCache] LRU淘汰: ${lruKey}`);
  }

  /**
   * 获取缓存结果
   */
  get(query: string, profile: UserProfile): KnowledgeDoc[] | null {
    const key = this.generateCacheKey(query, profile);
    const entry = this.cache.get(key);

    if (this.config.enableStats) {
      this.stats.totalQueries++;
    }

    if (!entry) {
      if (this.config.enableStats) {
        this.stats.cacheMisses++;
      }
      console.log(`[QueryCache] 缓存未命中: "${query}"`);
      return null;
    }

    // 检查是否过期
    if (!this.isValid(entry)) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }

      if (this.config.enableStats) {
        this.stats.cacheMisses++;
      }
      console.log(`[QueryCache] 缓存已过期: "${query}"`);
      return null;
    }

    // 缓存命中
    entry.hitCount++;
    this.updateAccessOrder(key);

    if (this.config.enableStats) {
      this.stats.cacheHits++;
    }

    const age = (Date.now() - entry.timestamp) / 1000;
    console.log(`[QueryCache] 缓存命中: "${query}" (缓存年龄: ${age.toFixed(1)}s, 命中次数: ${entry.hitCount})`);

    return entry.results;
  }

  /**
   * 设置缓存
   */
  set(query: string, profile: UserProfile, results: KnowledgeDoc[]): void {
    const key = this.generateCacheKey(query, profile);

    // 如果缓存已满,淘汰LRU
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      results,
      timestamp: Date.now(),
      hitCount: 0,
      profile,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);

    console.log(`[QueryCache] 缓存已存储: "${query}" (缓存大小: ${this.cache.size}/${this.config.maxSize})`);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    console.log('[QueryCache] 缓存已清空');
  }

  /**
   * 清除特定文档相关的缓存
   * (当文档被更新或删除时调用)
   */
  invalidateDocument(docId: string): void {
    let invalidatedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      // 检查是否包含该文档
      if (entry.results.some(doc => doc.id === docId || doc.id.startsWith(`chunk_`))) {
        this.cache.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
        }
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      console.log(`[QueryCache] 文档更新,已失效 ${invalidatedCount} 个缓存条目`);
    }
  }

  /**
   * 清理过期缓存(定期任务)
   */
  private cleanup(): void {
    const before = this.cache.size;
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValid(entry)) {
        this.cache.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
        }
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[QueryCache] 清理完成: 移除 ${expiredCount} 个过期缓存 (${before} -> ${this.cache.size})`);
    }
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    // 每2分钟清理一次过期缓存
    setInterval(() => {
      this.cleanup();
    }, 2 * 60 * 1000);
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const hitRate = this.stats.totalQueries > 0
      ? (this.stats.cacheHits / this.stats.totalQueries) * 100
      : 0;

    const avgResponseTime = this.stats.responseTimes.length > 0
      ? this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length
      : 0;

    return {
      totalQueries: this.stats.totalQueries,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      hitRate: parseFloat(hitRate.toFixed(2)),
      cacheSize: this.cache.size,
      averageResponseTime: parseFloat(avgResponseTime.toFixed(2)),
    };
  }

  /**
   * 记录响应时间
   */
  recordResponseTime(ms: number): void {
    if (this.config.enableStats) {
      this.stats.responseTimes.push(ms);
      // 只保留最近100次记录
      if (this.stats.responseTimes.length > 100) {
        this.stats.responseTimes.shift();
      }
    }
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      responseTimes: [],
    };
    console.log('[QueryCache] 统计已重置');
  }

  /**
   * 获取缓存详情(用于调试)
   */
  getCacheDetails(): Array<{key: string; query: string; age: number; hitCount: number}> {
    const details: Array<{key: string; query: string; age: number; hitCount: number}> = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = (Date.now() - entry.timestamp) / 1000;
      details.push({
        key,
        query: key.split(':')[0],
        age: parseFloat(age.toFixed(1)),
        hitCount: entry.hitCount,
      });
    }

    return details.sort((a, b) => b.hitCount - a.hitCount);
  }
}

/**
 * 导出单例实例
 */
export const queryCache = new QueryCache({
  maxSize: 100,
  ttlMinutes: 10,
  enableStats: true,
});
