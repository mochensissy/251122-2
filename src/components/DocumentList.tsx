import { useEffect, useState } from 'react';
import {
  CheckCircle,
  CheckSquare,
  Clock,
  FileText,
  Loader2,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ragEngine } from '../lib/rag-engine';

const TAG_VARIANTS = {
  role: {
    label: '角色',
    chipClass: 'bg-amber-50 text-amber-700 border border-amber-100 shadow-sm',
    dotClass: 'bg-amber-400',
  },
  sequence: {
    label: '序列',
    chipClass: 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm',
    dotClass: 'bg-indigo-400',
  },
} as const;

interface Document {
  id: string;
  title: string;
  content: string;
  is_chunked: boolean;
  chunk_count: number;
  created_at: string;
  tag_sequence: string;
  tag_level: string;
  tag_role_type: string;
}

interface DocumentListProps {
  onUpdate?: () => void;
}

export default function DocumentList({ onUpdate }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDocuments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('knowledge_docs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load documents:', error);
    } else {
      setDocuments(data || []);
    }
    setIsLoading(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((doc) => doc.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`确定要删除 ${selectedIds.size} 个文档吗？此操作无法恢复。`)) {
      return;
    }

    setIsProcessing(true);

    try {
      const idsToDelete = Array.from(selectedIds);

      for (const id of idsToDelete) {
        await supabase.from('document_chunks').delete().eq('doc_id', id);
      }

      const { error } = await supabase.from('knowledge_docs').delete().in('id', idsToDelete);

      if (error) throw error;

      setSelectedIds(new Set());
      await loadDocuments();
      onUpdate?.();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('删除失败: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchIndex = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessing(true);

    try {
      const selectedDocs = documents.filter((doc) => selectedIds.has(doc.id));

      for (const doc of selectedDocs) {
        setProcessingId(doc.id);
        await ragEngine.processDocument(doc.id, doc.content, {
          sequence: doc.tag_sequence,
          level: doc.tag_level,
          role_type: doc.tag_role_type,
        });
      }

      setSelectedIds(new Set());
      setProcessingId(null);
      await loadDocuments();
      onUpdate?.();
    } catch (err) {
      console.error('Indexing failed:', err);
      alert('索引失败: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingId(null);
    }
  };

  const handleSingleIndex = async (doc: Document) => {
    setIsProcessing(true);
    setProcessingId(doc.id);

    try {
      await ragEngine.processDocument(doc.id, doc.content, {
        sequence: doc.tag_sequence,
        level: doc.tag_level,
        role_type: doc.tag_role_type,
      });

      await loadDocuments();
      onUpdate?.();
    } catch (err) {
      console.error('Indexing failed:', err);
      alert('索引失败: ' + (err as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectedCount = selectedIds.size;
  const allSelected = documents.length > 0 && selectedIds.size === documents.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
              >
                {allSelected ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
                {allSelected ? '取消全选' : '全选'}
              </button>

              {selectedCount > 0 && (
                <span className="text-sm text-gray-500">已选择 {selectedCount} 个文档</span>
              )}
            </div>

            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBatchIndex}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
                >
                  <Zap className="w-4 h-4" />
                  批量索引
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  批量删除
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">暂无文档，请上传文档</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const tagChips: Array<{ key: keyof typeof TAG_VARIANTS; value: string }> = [
              { key: 'role', value: doc.tag_role_type || '全角色' },
              { key: 'sequence', value: doc.tag_sequence || '全员通用' },
            ];

            const isSelected = selectedIds.has(doc.id);

            return (
              <div
                key={doc.id}
                className={`bg-white border border-gray-200 rounded-lg p-4 transition-all ${
                  isSelected ? 'ring-2 ring-blue-100 shadow-md' : 'hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleSelect(doc.id)} className="flex-shrink-0 mt-1">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 truncate pr-4">{doc.title}</h3>
                      {doc.is_chunked ? (
                        <div className="flex items-center gap-1 text-sm text-green-600 flex-shrink-0">
                          <CheckCircle className="w-4 h-4" />
                          已索引
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-sm text-orange-600 flex-shrink-0">
                          <Clock className="w-4 h-4" />
                          未索引
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                      <span>分块数: {doc.chunk_count || 0}</span>
                      <span>{formatDate(doc.created_at)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                        标签
                      </span>
                      {tagChips.map(({ key, value }) => {
                        const variant = TAG_VARIANTS[key];
                        return (
                          <span
                            key={key}
                            className={`${variant.chipClass} inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide`}
                          >
                            <span className={`${variant.dotClass} w-1.5 h-1.5 rounded-full`} />
                            <span className="text-[11px] text-slate-500">{variant.label}</span>
                            <span className="text-xs font-bold text-slate-900/80">{value}</span>
                          </span>
                        );
                      })}
                    </div>

                    <p className="text-sm text-gray-600 line-clamp-2">{doc.content.substring(0, 150)}...</p>
                  </div>

                  {!doc.is_chunked && (
                    <button
                      onClick={() => handleSingleIndex(doc)}
                      disabled={isProcessing}
                      className="flex-shrink-0 flex items-center gap-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm disabled:opacity-50"
                    >
                      {processingId === doc.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          索引中
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          索引
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="text-gray-900">处理中...</span>
          </div>
        </div>
      )}
    </div>
  );
}
