import type { UserProfile, KnowledgeDoc } from './supabase';
import { supabase } from './supabase';
import { ragEngine } from './rag-engine';
import type { SearchResult } from './rag-engine';
import { queryCache } from './query-cache';

/**
 * 企业级RAG检索 - 主入口函数
 *
 * 优先使用向量检索,如果找不到结果则回退到传统关键词检索
 *
 * 关键改进:
 * - 返回分块内容而不是完整文档
 * - 集成查询缓存,提升响应速度
 */
export async function searchKnowledge(
  query: string,
  profile: UserProfile,
  docs: KnowledgeDoc[]
): Promise<KnowledgeDoc[]> {
  const startTime = Date.now();

  // 1. 检查缓存
  const cachedResults = queryCache.get(query, profile);
  if (cachedResults) {
    const responseTime = Date.now() - startTime;
    queryCache.recordResponseTime(responseTime);
    console.log(`[RAG] 缓存命中,响应时间: ${responseTime}ms`);
    return cachedResults;
  }

  let results: KnowledgeDoc[];

  try {
    // 2. 尝试使用企业级RAG引擎检索(向量+混合检索)
    // 增加检索数量到5个，提高找到相关内容的概率
    const searchResults: SearchResult[] = await ragEngine.search(query, profile, 5);

    if (searchResults.length > 0) {
      console.log('[RAG] 使用向量检索,找到', searchResults.length, '个分块结果');

      // 过滤掉相关性太低的结果（分数<0.2）
      const filteredResults = searchResults.filter(result => result.score > 0.2);

      if (filteredResults.length === 0) {
        console.log('[RAG] 所有结果相关性过低，回退到传统检索');
        results = await searchKnowledgeFallback(query, profile, docs);
      } else {
        console.log(`[RAG] 过滤后保留 ${filteredResults.length} 个高相关性结果`);

        // 关键修改: 将分块结果转换为伪文档格式,返回分块内容而不是整个文档
        const chunkDocs: KnowledgeDoc[] = filteredResults.map((result) => {
          // 查找原始文档以获取元数据
          const originalDoc = docs.find(doc => doc.id === result.doc_id);

          return {
            id: `chunk_${result.chunk_id}`,
            title: result.doc_title || originalDoc?.title || '相关内容',
            content: result.content, // 只返回相关的分块内容,而不是整个文档
            tag_sequence: originalDoc?.tag_sequence || profile.sequence,
            tag_level: originalDoc?.tag_level || profile.level,
            tag_role_type: originalDoc?.tag_role_type || profile.role_type,
            doc_type: originalDoc?.doc_type || 'policy',
            is_chunked: true,
            chunk_count: 0,
            created_at: originalDoc?.created_at || '',
          };
        });

        results = chunkDocs;
      }
    } else {
      console.log('[RAG] 向量检索未找到结果,回退到传统检索');
      // 3. 回退: 使用传统关键词检索
      results = await searchKnowledgeFallback(query, profile, docs);
    }
  } catch (error) {
    console.error('[RAG] 向量检索失败,回退到传统检索:', error);
    // 3. 回退: 使用传统关键词检索
    results = await searchKnowledgeFallback(query, profile, docs);
  }

  // 4. 存储到缓存
  if (results.length > 0) {
    queryCache.set(query, profile, results);
  }

  // 5. 记录响应时间
  const responseTime = Date.now() - startTime;
  queryCache.recordResponseTime(responseTime);
  console.log(`[RAG] 检索完成,响应时间: ${responseTime}ms`);

  return results;
}

/**
 * 传统关键词检索(作为回退方案)
 *
 * 优化：直接在分块级别检索，而不是完整文档
 */
async function searchKnowledgeFallback(
  query: string,
  profile: UserProfile,
  docs: KnowledgeDoc[]
): Promise<KnowledgeDoc[]> {
  const queryLower = query.toLowerCase();

  // 尝试从数据库直接检索分块
  try {
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('id, doc_id, content, tag_sequence, tag_level, tag_role_type')
      .or(`tag_sequence.eq.全员通用,tag_sequence.eq.${profile.sequence}`)
      .or(`tag_level.eq.全职级,tag_level.eq.${profile.level}`)
      .or(`tag_role_type.eq.全角色,tag_role_type.eq.${profile.role_type}`);

    if (chunks && chunks.length > 0) {
      // 计算每个分块的相关性分数
      const scoredChunks = chunks
        .map((chunk) => ({
          chunk,
          score: calculateChunkRelevance(queryLower, chunk.content),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      // 转换为伪文档格式
      const results: KnowledgeDoc[] = [];
      for (const { chunk } of scoredChunks) {
        const originalDoc = docs.find(d => d.id === chunk.doc_id);

        results.push({
          id: `chunk_${chunk.id}`,
          title: originalDoc?.title || '相关内容',
          content: chunk.content,
          tag_sequence: chunk.tag_sequence,
          tag_level: chunk.tag_level,
          tag_role_type: chunk.tag_role_type,
          doc_type: originalDoc?.doc_type || 'policy',
          is_chunked: true,
          chunk_count: 0,
          created_at: originalDoc?.created_at || '',
        });
      }

      if (results.length > 0) {
        console.log('[RAG] 传统检索找到分块:', results.length);
        return results;
      }
    }
  } catch (error) {
    console.error('[RAG] 分块检索失败:', error);
  }

  // 回退到完整文档检索
  const universalDocs = docs.filter(
    (d) =>
      d.tag_sequence === '全员通用' &&
      d.tag_level === '全职级' &&
      d.tag_role_type === '全角色'
  );

  const specificDocs = docs.filter((d) => {
    if (
      d.tag_sequence === '全员通用' &&
      d.tag_level === '全职级' &&
      d.tag_role_type === '全角色'
    ) {
      return false;
    }

    const sequenceMatch =
      d.tag_sequence === '全员通用' || d.tag_sequence === profile.sequence;
    const levelMatch = matchLevel(d.tag_level, profile.level);
    const roleMatch =
      d.tag_role_type === '全角色' || d.tag_role_type === profile.role_type;

    return sequenceMatch && levelMatch && roleMatch;
  });

  const allDocs = [...universalDocs, ...specificDocs];
  const scoredDocs = allDocs.map((doc) => ({
    doc,
    score: calculateRelevanceScore(queryLower, doc),
  }));

  return scoredDocs
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.doc);
}

/**
 * 计算分块内容的相关性
 */
function calculateChunkRelevance(query: string, content: string): number {
  let score = 0;
  const contentLower = content.toLowerCase();

  // 完全匹配得高分
  if (contentLower.includes(query)) {
    score += 100;
  }

  // 关键词匹配
  const keywords = query.split(/\s+/).filter((k) => k.length > 1);
  keywords.forEach((keyword) => {
    if (contentLower.includes(keyword)) {
      score += 30;
    }
  });

  // 双字符组合匹配
  if (query.length > 1) {
    const stopWords = ['我们', '什么', '怎么', '可以', '这个', '的', '是', '吗'];
    for (let i = 0; i < query.length - 1; i++) {
      const bigram = query.substring(i, i + 2);
      if (stopWords.includes(bigram)) continue;
      if (contentLower.includes(bigram)) {
        score += 5;
      }
    }
  }

  return score;
}

function matchLevel(docLevel: string, userLevel: string): boolean {
  if (docLevel === '全职级') return true;
  if (docLevel === userLevel) return true;

  // 职级范围匹配逻辑
  const levelRanges: Record<string, string[]> = {
    'P1-P3': ['P1', 'P2', 'P3', 'P1-P3'],
    'P4-P5': ['P4', 'P5', 'P4-P5'],
    'P6-P7': ['P6', 'P7', 'P6-P7'],
  };

  for (const [range, levels] of Object.entries(levelRanges)) {
    if (docLevel === range && levels.includes(userLevel)) {
      return true;
    }
  }

  return false;
}

function calculateRelevanceScore(query: string, doc: KnowledgeDoc): number {
  let score = 0;
  const content = (doc.title + '\n' + doc.content).toLowerCase();

  // 完全匹配得高分
  if (content.includes(query)) {
    score += 100;
  }

  // 关键词匹配
  const keywords = query.split(/\s+/).filter((k) => k.length > 1);
  keywords.forEach((keyword) => {
    if (content.includes(keyword)) {
      score += 20;
    }
  });

  // 双字符组合匹配（bigram）
  if (query.length > 1) {
    const stopWords = ['我们', '什么', '怎么', '可以', '这个', '的', '是', '吗'];
    for (let i = 0; i < query.length - 1; i++) {
      const bigram = query.substring(i, i + 2);
      if (stopWords.includes(bigram)) continue;
      if (content.includes(bigram)) {
        score += 2;
      }
    }
  }

  return score;
}

// 情绪检测
const EMOTION_KEYWORDS = {
  negative: ['难过', '失败', '沮丧', '不公', '焦虑', '烦', '气死', '绝望', '无语', '哭'],
  appeal: ['申诉', '投诉', '不满', '质疑', '不公平'],
  confused: ['困惑', '不明白', '为什么', '怎么办'],
};

export function detectEmotion(
  text: string
): 'negative' | 'appeal' | 'confused' | null {
  const lowerText = text.toLowerCase();

  for (const [type, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    if (keywords.some((k) => lowerText.includes(k))) {
      return type as 'negative' | 'appeal' | 'confused';
    }
  }

  return null;
}

export function getEmpathyPrefix(emotionType: string): string {
  const prefixes: Record<string, string> = {
    negative: '我非常理解您现在的心情，职场发展中遇到挑战是常有的事，请您不要灰心。',
    appeal: '我理解您希望寻求公正的解决方案。',
    confused: '我理解您的疑惑，让我为您详细解释。',
  };

  return prefixes[emotionType] || '';
}

// 导出缓存实例和缓存统计
export { queryCache } from './query-cache';
export type { CacheStats } from './query-cache';
