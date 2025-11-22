# RAG 分块检索修复说明

## 问题描述

之前的 RAG 系统虽然完成了文档分块和向量索引，但在返回检索结果时，仍然返回**整个文档的完整内容**，而不是相关的**分块片段**。

这导致用户无论问什么问题，都会收到整段整段的长文档内容。

## 根本原因

在 `src/lib/rag.ts` 的 `searchKnowledge` 函数中：

```typescript
// ❌ 旧代码 - 错误做法
const searchResults = await ragEngine.search(query, profile, 3);
const resultDocIds = searchResults.map(r => r.doc_id);
const matchedDocs = docs.filter(doc => resultDocIds.includes(doc.id));
return orderedDocs; // 返回完整文档
```

虽然 RAG 引擎返回的是分块结果（`SearchResult[]`，包含 `content` 字段），但代码又通过 `doc_id` 将其映射回完整的文档对象。

## 解决方案

### 核心修复

修改 `searchKnowledge` 函数，直接使用分块的 `content` 字段：

```typescript
// ✅ 新代码 - 正确做法
const searchResults = await ragEngine.search(query, profile, 3);

const chunkDocs: KnowledgeDoc[] = searchResults.map((result) => {
  const originalDoc = docs.find(doc => doc.id === result.doc_id);

  return {
    id: `chunk_${result.chunk_id}`,
    title: result.doc_title || originalDoc?.title || '相关内容',
    content: result.content, // ✅ 只返回分块内容，而不是整个文档
    // ... 其他元数据
  };
});

return chunkDocs;
```

### 界面优化

同时优化了 AI 回答的展示方式：

1. **单个结果**：直接显示分块内容
2. **多个结果**：显示前 3 个最相关的分块，并标注来源
3. **检索标识**：明确显示使用的是"RAG智能向量检索"还是"传统关键词检索"

```typescript
// 多个结果时的展示
matches.slice(0, 3).forEach((match, index) => {
  aiContent += `**【相关内容 ${index + 1}】来源: ${match.title}**\n${match.content}\n\n`;
});

aiContent += `\n📚 检索方式: 🎯 RAG智能向量检索 | 找到 ${matches.length} 个相关片段`;
```

## 使用效果对比

### 修复前 ❌
```
用户: 晋升需要什么条件？
AI: [返回整个3000字的《晋升管理办法》全文]
```

### 修复后 ✅
```
用户: 晋升需要什么条件？
AI: 【相关内容 1】来源: 晋升管理办法
晋升需要满足以下条件：1. 在当前职级工作满2年... (仅500字相关片段)

📚 检索方式: 🎯 RAG智能向量检索 | 找到 3 个相关片段
```

## 系统架构

```
用户提问
    ↓
RAG 引擎检索
    ↓
返回 3 个最相关分块 (SearchResult[])
    ↓
【关键修复】直接使用分块的 content 字段
    ↓
构建回答（显示分块内容）
    ↓
返回给用户
```

## 测试方法

1. 进入专家端 → 系统设置
2. 点击"批量处理文档"，确保文档已分块和索引
3. 切换到员工端，输入问题
4. 观察返回结果应该是精准的相关片段，而不是整个文档

## 后续优化建议

1. **答案合成**：将多个分块智能合成为连贯的回答
2. **上下文扩展**：如果单个分块信息不足，自动获取前后相邻分块
3. **相似度阈值**：过滤掉相似度过低的结果
4. **引用标注**：为每个片段添加文档出处和页码信息
