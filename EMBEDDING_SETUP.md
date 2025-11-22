# 真实Embedding API集成指南

## 功能说明

系统现在支持两种向量嵌入模式:

1. **模拟向量模式**(默认) - 用于开发测试,不需要OpenAI API
2. **真实API模式** - 使用OpenAI Embeddings API,提供真实语义理解能力

## 快速启动(模拟向量模式)

系统默认使用模拟向量,无需任何配置即可运行。

```bash
npm run dev
```

## 切换到真实API模式

### 第一步: 获取OpenAI API密钥

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的API密钥(复制并妥善保存)

### 第二步: 部署Edge Function

使用Supabase CLI部署generate-embeddings函数:

```bash
# 安装Supabase CLI (如果未安装)
npm install -g supabase

# 登录Supabase
supabase login

# 链接到你的项目
supabase link --project-ref jrynjbgyrmwvkdnmifph

# 设置OpenAI API密钥为Edge Function的环境变量
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here

# 部署Edge Function
supabase functions deploy generate-embeddings
```

### 第三步: 启用真实API模式

修改 `.env` 文件:

```bash
# 将false改为true
VITE_USE_REAL_EMBEDDINGS=true
```

### 第四步: 重启应用

```bash
npm run dev
```

## 验证部署

### 1. 测试Edge Function

使用curl测试Edge Function是否正常工作:

```bash
curl -X POST 'https://jrynjbgyrmwvkdnmifph.supabase.co/functions/v1/generate-embeddings' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "texts": ["测试文本"],
    "model": "text-embedding-3-small"
  }'
```

预期响应:
```json
{
  "embeddings": [[0.123, -0.456, ...]],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 3,
    "total_tokens": 3
  }
}
```

### 2. 观察浏览器控制台

打开浏览器开发者工具,上传新文档时应该看到:

```
[RAG引擎] 开始处理文档: xxx
[RAG引擎] 文档分块完成: 5 个分块
[Embeddings] 批次 1: 已生成 5 个向量
[RAG引擎] 向量嵌入生成完成
```

### 3. 检索测试

切换到员工端,提问后观察控制台:
- 使用真实API: 会看到 `[Embeddings] 批次 1: 已生成 1 个向量`
- 使用模拟向量: 不会有此日志

## 成本估算

使用OpenAI `text-embedding-3-small` 模型:

| 操作 | Token消耗 | 成本(美元) |
|------|----------|-----------|
| 处理1000字文档(约5个分块) | ~1500 tokens | $0.00003 |
| 单次检索查询 | ~50 tokens | $0.000001 |
| 处理100个文档 | ~150,000 tokens | $0.003 |

**月度成本估算**:
- 知识库: 1000个文档 → $0.03
- 检索: 10,000次查询/月 → $0.01
- **总计**: 约 $0.05/月

## 模型选择

系统默认使用 `text-embedding-3-small`:

| 模型 | 维度 | 性能 | 成本 | 推荐场景 |
|------|------|------|------|---------|
| text-embedding-3-small | 1536 | 良好 | $0.00002/1K tokens | **推荐**用于生产环境 |
| text-embedding-3-large | 3072 | 最佳 | $0.00013/1K tokens | 需要最高精度的场景 |
| text-embedding-ada-002 | 1536 | 较好 | $0.00010/1K tokens | 旧版模型,不推荐 |

修改模型(在Edge Function代码中):
```typescript
model: 'text-embedding-3-large'  // 修改此行
```

## 常见问题

### Q: 如何知道当前使用的是哪种模式?

A: 查看 `.env` 文件中的 `VITE_USE_REAL_EMBEDDINGS` 值:
- `false` = 模拟向量模式
- `true` = 真实API模式

### Q: Edge Function部署失败怎么办?

A: 检查以下几点:
1. 是否正确安装Supabase CLI
2. 是否已登录并链接项目
3. 是否设置了OPENAI_API_KEY环境变量
4. OpenAI API密钥是否有效

### Q: API调用失败会发生什么?

A: 系统有自动回退机制:
1. 首先尝试调用真实API
2. 如果失败,自动切换到模拟向量
3. 在控制台输出警告信息

### Q: 如何批量重建所有文档的向量?

A: 在专家端 → 知识库管理 → 点击"重建索引"按钮

### Q: 真实API模式下,之前的模拟向量需要删除吗?

A: 建议删除并重建:
1. 执行 `DELETE FROM document_chunks;`
2. 执行 `DELETE FROM chunk_metadata;`
3. 执行 `UPDATE knowledge_docs SET is_chunked = false;`
4. 在专家端点击"重建索引"

## 性能优化

### 1. 批量处理

系统自动批量处理最多100个文本,减少API调用次数。

### 2. 错误重试

在 `EmbeddingGenerator` 中添加重试逻辑:

```typescript
private async generateRealEmbeddings(texts: string[]): Promise<number[][]> {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // API调用逻辑
      return embeddings;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        // 回退到模拟向量
        return texts.map(text => this.generateMockEmbedding(text));
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
}
```

### 3. 缓存优化

对频繁查询的文本进行缓存(待实现):
- 使用Redis或Supabase存储查询向量
- 相同查询直接返回缓存向量

## 安全建议

1. **保护API密钥**: 绝不要在前端代码或Git仓库中暴露OpenAI API密钥
2. **使用Edge Function**: 所有API调用都通过服务端Edge Function,密钥存储在Supabase Secrets中
3. **速率限制**: 在Edge Function中添加速率限制,防止滥用
4. **监控用量**: 定期检查OpenAI控制台的用量统计

## 进一步优化

1. **使用Cohere**: 如果OpenAI价格太高,可以切换到Cohere Embeddings
2. **自托管模型**: 使用HuggingFace的开源模型自建服务
3. **混合策略**: 常见查询使用缓存,新查询调用API

## 技术支持

如有问题,请查看:
- [OpenAI Embeddings文档](https://platform.openai.com/docs/guides/embeddings)
- [Supabase Edge Functions文档](https://supabase.com/docs/guides/functions)
- 系统日志(浏览器控制台和Supabase函数日志)
