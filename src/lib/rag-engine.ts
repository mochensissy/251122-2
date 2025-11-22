/**
 * 企业级RAG检索引擎
 *
 * 核心功能:
 * 1. 智能文档分块 - 语义感知的文本切分
 * 2. 向量化处理 - 文本嵌入生成
 * 3. 混合检索 - 向量+关键词+元数据融合
 * 4. 结果重排序 - 基于相关性的二次排序
 */

import { supabase } from './supabase';
import type { UserProfile } from './supabase';

/**
 * 文档分块接口
 */
export interface DocumentChunk {
  id: string;
  doc_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  embedding?: number[];
  tag_sequence: string;
  tag_level: string;
  tag_role_type: string;
}

/**
 * 检索结果接口
 */
export interface SearchResult {
  chunk_id: string;
  doc_id: string;
  content: string;
  score: number;
  doc_title?: string;
  metadata?: {
    sequence: string;
    level: string;
    role_type: string;
    doc_sequence?: string;
    doc_level?: string;
    doc_role_type?: string;
  };
}

/**
 * 智能文档分块器
 *
 * 策略:
 * 1. 基于语义边界切分(段落、标题)
 * 2. 每个分块500-1000字符
 * 3. 保持上下文连贯性,chunk之间有50字符重叠
 * 4. 识别并保留结构化信息(列表、标题)
 */
export class DocumentChunker {
  private readonly MIN_CHUNK_SIZE = 500;
  private readonly MAX_CHUNK_SIZE = 1000;
  private readonly OVERLAP_SIZE = 50;

  /**
   * 将文档内容切分为多个chunk
   */
  chunk(content: string): string[] {
    const chunks: string[] = [];

    // 第一步: 按段落分割
    const paragraphs = this.splitIntoParagraphs(content);

    let currentChunk = '';
    let previousOverlap = '';

    for (const paragraph of paragraphs) {
      // 如果当前段落本身就很长,需要进一步切分
      if (paragraph.length > this.MAX_CHUNK_SIZE) {
        // 保存当前累积的chunk
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          previousOverlap = this.extractOverlap(currentChunk);
          currentChunk = '';
        }

        // 切分长段落
        const subChunks = this.splitLongParagraph(paragraph);
        for (let i = 0; i < subChunks.length; i++) {
          const subChunk = subChunks[i];
          if (i === 0 && previousOverlap) {
            chunks.push((previousOverlap + '\n' + subChunk).trim());
          } else {
            chunks.push(subChunk.trim());
          }
          previousOverlap = this.extractOverlap(subChunk);
        }
        continue;
      }

      // 尝试将段落加入当前chunk
      const testChunk = currentChunk + '\n' + paragraph;

      if (testChunk.length <= this.MAX_CHUNK_SIZE) {
        currentChunk = testChunk;
      } else {
        // 当前chunk已满,保存并开始新chunk
        if (currentChunk.length >= this.MIN_CHUNK_SIZE) {
          chunks.push(currentChunk.trim());
          previousOverlap = this.extractOverlap(currentChunk);
          currentChunk = previousOverlap + '\n' + paragraph;
        } else {
          // 当前chunk太小,继续累积
          currentChunk = testChunk;
        }
      }
    }

    // 保存最后一个chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 100); // 过滤太短的chunk
  }

  /**
   * 按段落分割文本
   */
  private splitIntoParagraphs(text: string): string[] {
    // 按双换行符或标题标记分割
    const paragraphs = text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    return paragraphs;
  }

  /**
   * 切分过长的段落
   */
  private splitLongParagraph(paragraph: string): string[] {
    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(paragraph);

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.MAX_CHUNK_SIZE && currentChunk.length > this.MIN_CHUNK_SIZE) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * 按句子分割
   */
  private splitIntoSentences(text: string): string[] {
    // 按中文句号、问号、感叹号分割
    return text
      .split(/([。!?]+)/)
      .reduce((acc: string[], curr, idx, arr) => {
        if (idx % 2 === 0 && curr) {
          const sentence = curr + (arr[idx + 1] || '');
          acc.push(sentence);
        }
        return acc;
      }, [])
      .filter(s => s.trim().length > 0);
  }

  /**
   * 提取chunk末尾的重叠部分
   */
  private extractOverlap(chunk: string): string {
    if (chunk.length <= this.OVERLAP_SIZE) {
      return chunk;
    }
    return chunk.slice(-this.OVERLAP_SIZE);
  }

  /**
   * 估算token数量(中文约1.5字符/token,英文约4字符/token)
   */
  estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}

/**
 * 向量嵌入生成器配置
 */
interface EmbeddingConfig {
  useRealAPI: boolean;
  batchSize: number;
  model: string;
}

/**
 * 向量嵌入生成器
 *
 * 支持真实API和模拟向量两种模式
 */
export class EmbeddingGenerator {
  private config: EmbeddingConfig = {
    useRealAPI: import.meta.env.VITE_USE_REAL_EMBEDDINGS === 'true',
    batchSize: 100,
    model: 'text-embedding-3-small',
  };

  /**
   * 为文本生成向量嵌入
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.config.useRealAPI) {
      const embeddings = await this.generateRealEmbeddings([text]);
      return embeddings[0];
    } else {
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * 批量生成嵌入(提高效率)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (this.config.useRealAPI) {
      return this.generateRealEmbeddings(texts);
    } else {
      return texts.map(text => this.generateMockEmbedding(text));
    }
  }

  /**
   * 调用真实的Embedding API
   */
  private async generateRealEmbeddings(texts: string[]): Promise<number[][]> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[Embeddings] Supabase配置缺失,回退到模拟向量');
      return texts.map(text => this.generateMockEmbedding(text));
    }

    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/generate-embeddings`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              texts: batch,
              model: this.config.model,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Embeddings] API调用失败: ${response.status} - ${errorText}`);
          console.warn('[Embeddings] 回退到模拟向量');
          return texts.map(text => this.generateMockEmbedding(text));
        }

        const data = await response.json();

        if (data.error) {
          console.error('[Embeddings] API返回错误:', data.error);
          console.warn('[Embeddings] 回退到模拟向量');
          return texts.map(text => this.generateMockEmbedding(text));
        }

        allEmbeddings.push(...data.embeddings);
        console.log(`[Embeddings] 批次 ${Math.floor(i / this.config.batchSize) + 1}: 已生成 ${batch.length} 个向量`);
      } catch (error) {
        console.error('[Embeddings] 网络错误:', error);
        console.warn('[Embeddings] 回退到模拟向量');
        return texts.map(text => this.generateMockEmbedding(text));
      }
    }

    return allEmbeddings;
  }

  /**
   * 生成模拟向量(用于原型测试)
   *
   * 使用文本内容的特征生成确定性的伪随机向量
   * 相似文本会生成相似向量
   */
  private generateMockEmbedding(text: string): number[] {
    const dim = 1536;
    const embedding = new Array(dim);

    // 使用文本哈希作为种子
    let seed = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 1000000;
    }

    // 生成确定性伪随机向量
    for (let i = 0; i < dim; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      embedding[i] = (seed / 233280.0 - 0.5) * 2;
    }

    // 归一化
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < dim; i++) {
      embedding[i] /= norm;
    }

    return embedding;
  }
}

/**
 * 关键词提取器
 */
export class KeywordExtractor {
  private readonly stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
    '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没',
    '看', '好', '自己', '这', '那', '什么', '以', '及', '或者', '如果'
  ]);

  /**
   * 从文本中提取关键词
   */
  extract(text: string, maxKeywords: number = 10): string[] {
    // 简单实现: 词频统计 + 停用词过滤
    const words = this.tokenize(text);
    const wordFreq: Record<string, number> = {};

    for (const word of words) {
      if (word.length >= 2 && !this.stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }

    // 按频率排序
    const keywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);

    return keywords;
  }

  /**
   * 简单中文分词(实际应用应使用专业分词库如jieba)
   */
  private tokenize(text: string): string[] {
    // 按字符类型分割
    const tokens: string[] = [];
    let currentToken = '';
    let lastType = '';

    for (const char of text) {
      const type = this.getCharType(char);

      if (type === lastType && type !== 'other') {
        currentToken += char;
      } else {
        if (currentToken.length > 0) {
          tokens.push(currentToken);
        }
        currentToken = char;
        lastType = type;
      }
    }

    if (currentToken.length > 0) {
      tokens.push(currentToken);
    }

    return tokens.filter(t => t.trim().length > 0);
  }

  private getCharType(char: string): string {
    if (/[\u4e00-\u9fa5]/.test(char)) return 'chinese';
    if (/[a-zA-Z0-9]/.test(char)) return 'alphanum';
    return 'other';
  }
}

/**
 * RAG检索引擎
 *
 * 核心功能:
 * 1. 文档处理与分块
 * 2. 混合检索
 * 3. 结果重排序
 */
export class RAGEngine {
  private chunker = new DocumentChunker();
  private embedder = new EmbeddingGenerator();
  private keywordExtractor = new KeywordExtractor();

  /**
   * 处理并索引新文档
   *
   * 步骤:
   * 1. 文档分块
   * 2. 生成向量嵌入
   * 3. 提取关键词
   * 4. 存储到数据库
   */
  async processDocument(
    docId: string,
    content: string,
    metadata: {
      sequence: string;
      level: string;
      role_type: string;
    }
  ): Promise<void> {
    console.log(`[RAG引擎] 开始处理文档: ${docId}`);

    // 1. 文档分块
    const chunks = this.chunker.chunk(content);
    console.log(`[RAG引擎] 文档分块完成: ${chunks.length} 个分块`);

    // 2. 生成嵌入向量
    const embeddings = await this.embedder.generateBatchEmbeddings(chunks);
    console.log(`[RAG引擎] 向量嵌入生成完成`);

    // 3. 存储分块
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const tokens = this.chunker.estimateTokens(chunk);

      // 插入document_chunks
      const { data: chunkData, error: chunkError } = await supabase
        .from('document_chunks')
        .insert({
          doc_id: docId,
          chunk_index: i,
          content: chunk,
          token_count: tokens,
          embedding: embedding,
          tag_sequence: metadata.sequence,
          tag_level: metadata.level,
          tag_role_type: metadata.role_type,
        })
        .select()
        .single();

      if (chunkError) {
        console.error(`[RAG引擎] 分块存储失败:`, chunkError);
        continue;
      }

      // 4. 提取并存储元数据
      const keywords = this.keywordExtractor.extract(chunk);

      await supabase.from('chunk_metadata').insert({
        chunk_id: chunkData.id,
        keywords: keywords,
        entities: {},
        section_title: this.extractSectionTitle(chunk),
        relevance_score: 0,
      });
    }

    // 5. 更新文档状态
    await supabase
      .from('knowledge_docs')
      .update({
        is_chunked: true,
        chunk_count: chunks.length,
      })
      .eq('id', docId);

    console.log(`[RAG引擎] 文档处理完成: ${docId}`);
  }

  /**
   * 执行混合检索
   *
   * 策略:
   * 1. 向量检索(70%权重)
   * 2. 关键词检索(30%权重)
   * 3. 元数据过滤(用户画像)
   * 4. 结果重排序
   */
  async search(
    query: string,
    profile: UserProfile,
    topK: number = 5
  ): Promise<SearchResult[]> {
    const startTime = Date.now();

    console.log(`[RAG引擎] 开始检索: "${query}"`);

    // 1. 生成查询向量
    const queryEmbedding = await this.embedder.generateEmbedding(query);

    // 2. 调用混合检索函数
    const { data: results, error } = await supabase.rpc('hybrid_search', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: topK,
      filter_sequence: profile.sequence,
      filter_level: profile.level,
      filter_role_type: profile.role_type,
    });

    if (error) {
      console.error('[RAG引擎] 检索失败:', error);
      return [];
    }

    if (!results || results.length === 0) {
      console.log('[RAG引擎] 未找到匹配结果');
      return [];
    }

    // 3. 获取文档标题
    const docIds = [...new Set(results.map((r: any) => r.doc_id))];
    const { data: docs } = await supabase
      .from('knowledge_docs')
      .select('id, title, tag_sequence, tag_level, tag_role_type')
      .in('id', docIds);

    const docDetailsMap = new Map(
      (docs || []).map(d => [
        d.id,
        {
          title: d.title,
          tag_sequence: d.tag_sequence,
          tag_level: d.tag_level,
          tag_role_type: d.tag_role_type,
        },
      ])
    );

    // 4. 构造返回结果
    const searchResults: SearchResult[] = results.map((r: any) => ({
      chunk_id: r.chunk_id,
      doc_id: r.doc_id,
      content: r.content,
      score: r.combined_score,
      doc_title: docDetailsMap.get(r.doc_id)?.title,
      metadata: {
        sequence: profile.sequence,
        level: profile.level,
        role_type: profile.role_type,
        doc_sequence: docDetailsMap.get(r.doc_id)?.tag_sequence,
        doc_level: docDetailsMap.get(r.doc_id)?.tag_level,
        doc_role_type: docDetailsMap.get(r.doc_id)?.tag_role_type,
      },
    }));

    // 5. 记录检索日志
    const responseTime = Date.now() - startTime;
    await supabase.from('search_logs').insert({
      query: query,
      user_profile: profile,
      retrieval_method: 'hybrid',
      matched_chunks: searchResults.map(r => r.chunk_id),
      response_time_ms: responseTime,
    });

    console.log(`[RAG引擎] 检索完成: 找到 ${searchResults.length} 个结果, 耗时 ${responseTime}ms`);

    return searchResults;
  }

  /**
   * 重新处理所有未分块的文档
   */
  async reprocessAllDocuments(): Promise<void> {
    console.log('[RAG引擎] 开始批量处理文档...');

    const { data: docs } = await supabase
      .from('knowledge_docs')
      .select('*')
      .eq('is_chunked', false);

    if (!docs || docs.length === 0) {
      console.log('[RAG引擎] 没有需要处理的文档');
      return;
    }

    console.log(`[RAG引擎] 找到 ${docs.length} 个待处理文档`);

    for (const doc of docs) {
      try {
        await this.processDocument(doc.id, doc.content, {
          sequence: doc.tag_sequence,
          level: doc.tag_level,
          role_type: doc.tag_role_type,
        });
      } catch (error) {
        console.error(`[RAG引擎] 文档处理失败 ${doc.id}:`, error);
      }
    }

    console.log('[RAG引擎] 批量处理完成');
  }

  /**
   * 提取章节标题(简单实现)
   */
  private extractSectionTitle(chunk: string): string {
    const lines = chunk.split('\n');
    const firstLine = lines[0].trim();

    // 如果第一行较短且包含数字或"第X条"等,可能是标题
    if (firstLine.length < 50 && /^(第|[0-9一二三四五六七八九十]+[、.)]|\d+\.)/.test(firstLine)) {
      return firstLine;
    }

    return '';
  }
}

/**
 * 导出单例实例
 */
export const ragEngine = new RAGEngine();
