/**
 * 批量文档处理器
 *
 * 功能说明:
 * 1. 异步批量处理知识库文档
 * 2. 实时进度跟踪和状态更新
 * 3. 错误处理和任务恢复
 * 4. 性能优化(并发控制、队列管理)
 *
 * 工作流程:
 * 1. 创建批处理任务记录
 * 2. 获取待处理文档列表
 * 3. 按批次处理文档(支持并发)
 * 4. 实时更新进度和状态
 * 5. 记录详细的处理日志
 */

import { supabase } from './supabase';
import { ragEngine } from './rag-engine';

/**
 * 批处理结果接口
 */
export interface BatchProcessResult {
  taskId: string;
  success: boolean;
  totalDocs: number;
  processedDocs: number;
  failedDocs: number;
  errors: Array<{ docId: string; docTitle: string; error: string }>;
  duration: number;
}

/**
 * 批处理进度回调接口
 */
export interface BatchProgressCallback {
  (current: number, total: number, currentDocTitle?: string): void;
}

/**
 * 任务状态枚举
 */
export type BatchTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 批量文档处理器类
 *
 * 核心特性:
 * - 异步处理: 不阻塞UI,支持长时间运行任务
 * - 进度跟踪: 实时更新处理进度
 * - 错误恢复: 单个文档失败不影响整体任务
 * - 并发控制: 可配置并发处理数量
 * - 任务持久化: 所有任务信息存储在数据库
 */
export class BatchDocumentProcessor {
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private currentTaskId: string | null = null;
  private readonly CONCURRENT_LIMIT = 5; // 并发处理文档数(优化后)
  private readonly MAX_RETRIES = 3; // 最大重试次数
  private readonly RETRY_DELAY = 1000; // 重试延迟(毫秒)

  /**
   * 批量处理所有未分块的文档
   *
   * @param onProgress - 进度回调函数
   * @returns 处理结果
   */
  async processAllDocuments(
    onProgress?: BatchProgressCallback
  ): Promise<BatchProcessResult> {
    if (this.isProcessing) {
      throw new Error('批量处理已在进行中,请等待当前任务完成');
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    let taskId: string | null = null;

    try {
      console.log('[批量处理] 开始批量处理流程...');

      // 1. 获取待处理文档列表
      const { data: docs, error: fetchError } = await supabase
        .from('knowledge_docs')
        .select('id, title, content, tag_sequence, tag_level, tag_role_type')
        .eq('is_chunked', false);

      if (fetchError) {
        throw new Error(`获取文档列表失败: ${fetchError.message}`);
      }

      if (!docs || docs.length === 0) {
        console.log('[批量处理] 没有待处理文档');
        return {
          taskId: 'no-task',
          success: true,
          totalDocs: 0,
          processedDocs: 0,
          failedDocs: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }

      console.log(`[批量处理] 找到 ${docs.length} 个待处理文档`);

      // 2. 创建批处理任务记录
      const { data: taskData, error: taskError } = await supabase.rpc(
        'initialize_batch_task',
        { doc_count: docs.length }
      );

      if (taskError) {
        throw new Error(`创建批处理任务失败: ${taskError.message}`);
      }

      taskId = taskData as string;
      this.currentTaskId = taskId;

      console.log(`[批量处理] 创建任务: ${taskId}`);

      // 3. 更新任务状态为运行中
      await supabase.rpc('update_batch_task_progress', {
        task_id_param: taskId,
        processed_count: 0,
        failed_count: 0,
        new_status: 'running',
      });

      // 4. 初始化处理结果
      const result: BatchProcessResult = {
        taskId,
        success: false,
        totalDocs: docs.length,
        processedDocs: 0,
        failedDocs: 0,
        errors: [],
        duration: 0,
      };

      // 5. 并发批量处理文档(优化版)
      await this.processConcurrently(docs, taskId, result, onProgress);

      // 6. 任务完成,更新最终状态
      result.success = result.failedDocs === 0;
      result.duration = Date.now() - startTime;

      await supabase.rpc('update_batch_task_progress', {
        task_id_param: taskId,
        processed_count: result.processedDocs,
        failed_count: result.failedDocs,
        new_status: result.success ? 'completed' : 'failed',
      });

      // 如果有失败,记录错误信息
      if (result.errors.length > 0) {
        await supabase
          .from('batch_processing_tasks')
          .update({
            error_message: `${result.failedDocs} 个文档处理失败`,
          })
          .eq('id', taskId);
      }

      console.log(
        `[批量处理] 任务完成: 成功 ${result.processedDocs}/${result.totalDocs}, 失败 ${result.failedDocs}, 耗时 ${result.duration}ms`
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error('[批量处理] 批处理任务异常:', error);

      // 标记任务为失败
      if (taskId) {
        await supabase
          .from('batch_processing_tasks')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', taskId);
      }

      throw error;
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      this.currentTaskId = null;
    }
  }

  /**
   * 中止当前批处理任务
   */
  async abortProcessing(): Promise<void> {
    if (!this.isProcessing || !this.abortController) {
      console.warn('[批量处理] 没有正在运行的任务');
      return;
    }

    console.log('[批量处理] 正在中止任务...');
    this.abortController.abort();
  }

  /**
   * 获取当前处理状态
   */
  getProcessingStatus(): boolean {
    return this.isProcessing;
  }

  /**
   * 获取当前任务ID
   */
  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * 获取批处理任务历史
   */
  async getTaskHistory(limit: number = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('batch_processing_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[批量处理] 获取任务历史失败:', error);
      return [];
    }

    return data || [];
  }

  /**
   * 获取任务详情(包含文档处理日志)
   */
  async getTaskDetails(taskId: string): Promise<{
    task: any;
    logs: any[];
  } | null> {
    const { data: task } = await supabase
      .from('batch_processing_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (!task) {
      return null;
    }

    const { data: logs } = await supabase
      .from('batch_doc_processing_logs')
      .select('*, knowledge_docs(title)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    return {
      task,
      logs: logs || [],
    };
  }

  /**
   * 获取批处理统计信息
   */
  async getBatchStats(): Promise<any> {
    const { data, error } = await supabase.rpc('get_batch_processing_stats');

    if (error) {
      console.error('[批量处理] 获取统计信息失败:', error);
      return null;
    }

    return data?.[0] || null;
  }

  /**
   * 并发处理文档
   *
   * 使用Promise.all实现真正的并发处理,提升整体吞吐量
   */
  private async processConcurrently(
    docs: any[],
    taskId: string,
    result: BatchProcessResult,
    onProgress?: BatchProgressCallback
  ): Promise<void> {
    for (let i = 0; i < docs.length; i += this.CONCURRENT_LIMIT) {
      // 检查是否被中止
      if (this.abortController?.signal.aborted) {
        console.log('[批量处理] 任务被用户中止');
        await this.markTaskAsCancelled(taskId);
        return;
      }

      // 获取当前批次的文档
      const batch = docs.slice(i, i + this.CONCURRENT_LIMIT);
      const batchStartTime = Date.now();

      console.log(
        `[批量处理] 处理第 ${Math.floor(i / this.CONCURRENT_LIMIT) + 1} 批, ` +
        `文档 ${i + 1}-${Math.min(i + batch.length, docs.length)}/${docs.length}`
      );

      // 并发处理当前批次
      const batchPromises = batch.map(async (doc, batchIndex) => {
        const globalIndex = i + batchIndex;
        return this.processSingleDocumentWithRetry(
          doc,
          taskId,
          globalIndex + 1,
          docs.length,
          result,
          onProgress
        );
      });

      // 等待当前批次完成
      await Promise.all(batchPromises);

      const batchTime = Date.now() - batchStartTime;
      console.log(
        `[批量处理] 批次完成,耗时 ${batchTime}ms, ` +
        `平均每文档 ${Math.round(batchTime / batch.length)}ms`
      );

      // 更新批处理任务进度
      await supabase.rpc('update_batch_task_progress', {
        task_id_param: taskId,
        processed_count: result.processedDocs,
        failed_count: result.failedDocs,
      });
    }
  }

  /**
   * 处理单个文档(支持重试)
   */
  private async processSingleDocumentWithRetry(
    doc: any,
    taskId: string,
    currentIndex: number,
    totalDocs: number,
    result: BatchProcessResult,
    onProgress?: BatchProgressCallback
  ): Promise<void> {
    let lastError: Error | null = null;
    const docStartTime = Date.now();

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(
          `[批量处理] 处理文档 ${currentIndex}/${totalDocs}: ${doc.title}` +
          (attempt > 1 ? ` (重试 ${attempt - 1}/${this.MAX_RETRIES - 1})` : '')
        );

        // 创建文档处理日志
        const { data: logData } = await supabase
          .from('batch_doc_processing_logs')
          .insert({
            doc_id: doc.id,
            task_id: taskId,
            status: 'running',
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        // 处理文档
        await ragEngine.processDocument(doc.id, doc.content, {
          sequence: doc.tag_sequence,
          level: doc.tag_level,
          role_type: doc.tag_role_type,
        });

        const processingTime = Date.now() - docStartTime;

        // 获取分块数量
        const { count: chunkCount } = await supabase
          .from('document_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('doc_id', doc.id);

        // 更新文档处理日志
        if (logData) {
          await supabase
            .from('batch_doc_processing_logs')
            .update({
              status: 'completed',
              chunks_created: chunkCount || 0,
              processing_time_ms: processingTime,
              completed_at: new Date().toISOString(),
            })
            .eq('id', logData.id);
        }

        result.processedDocs++;
        console.log(
          `[批量处理] 文档处理成功: ${doc.title} ` +
          `(耗时: ${processingTime}ms, 分块: ${chunkCount})` +
          (attempt > 1 ? ` [重试成功]` : '')
        );

        // 调用进度回调
        if (onProgress) {
          onProgress(currentIndex, totalDocs, doc.title);
        }

        return; // 成功则退出重试循环
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[批量处理] 文档处理失败 (尝试 ${attempt}/${this.MAX_RETRIES}): ${doc.title}`,
          error
        );

        // 如果不是最后一次尝试,等待后重试
        if (attempt < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
        }
      }
    }

    // 所有重试都失败
    const processingTime = Date.now() - docStartTime;
    const errorMsg = lastError?.message || '未知错误';

    result.failedDocs++;
    result.errors.push({
      docId: doc.id,
      docTitle: doc.title,
      error: `${errorMsg} (已重试 ${this.MAX_RETRIES} 次)`,
    });

    // 更新文档处理日志为失败
    await supabase
      .from('batch_doc_processing_logs')
      .update({
        status: 'failed',
        error_message: `${errorMsg} (已重试 ${this.MAX_RETRIES} 次)`,
        processing_time_ms: processingTime,
        completed_at: new Date().toISOString(),
      })
      .eq('doc_id', doc.id)
      .eq('task_id', taskId);

    // 调用进度回调
    if (onProgress) {
      onProgress(currentIndex, totalDocs, doc.title);
    }
  }

  /**
   * 标记任务为已取消
   */
  private async markTaskAsCancelled(taskId: string): Promise<void> {
    await supabase
      .from('batch_processing_tasks')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  }
}

/**
 * 导出单例实例
 */
export const batchProcessor = new BatchDocumentProcessor();
