/**
 * Supabase Edge Function: 生成文本向量嵌入
 *
 * 功能说明:
 * 1. 接收文本内容(单个或批量)
 * 2. 调用OpenAI Embeddings API生成向量
 * 3. 返回1536维向量数组
 *
 * API路径: /functions/v1/generate-embeddings
 *
 * 请求示例:
 * {
 *   "texts": ["文本1", "文本2"],
 *   "model": "text-embedding-3-small" // 可选,默认使用text-embedding-3-small
 * }
 *
 * 响应示例:
 * {
 *   "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]],
 *   "model": "text-embedding-3-small",
 *   "usage": { "prompt_tokens": 10, "total_tokens": 10 }
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY环境变量未配置");
    }

    const requestData: EmbeddingRequest = await req.json();
    const { texts, model = "text-embedding-3-small" } = requestData;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ error: "texts参数必须是非空数组" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[Embeddings] 开始生成嵌入: ${texts.length}个文本, 模型: ${model}`);

    const openaiResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: model,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error("[Embeddings] OpenAI API错误:", errorData);
      throw new Error(`OpenAI API错误: ${openaiResponse.status} - ${errorData}`);
    }

    const openaiData = await openaiResponse.json();

    const embeddings = openaiData.data.map((item: any) => item.embedding);

    const response: EmbeddingResponse = {
      embeddings,
      model: openaiData.model,
      usage: openaiData.usage,
    };

    console.log(`[Embeddings] 成功生成 ${embeddings.length} 个向量, Token用量: ${openaiData.usage.total_tokens}`);

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[Embeddings] 错误:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "未知错误",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
