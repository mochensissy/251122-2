/**
 * 文件上传组件
 *
 * 功能:
 * 1. 拖拽上传 - 支持拖放文件
 * 2. 点击上传 - 传统文件选择
 * 3. 多格式支持 - PDF、Word、Excel、TXT
 * 4. 批量上传 - 同时上传多个文件
 * 5. 进度显示 - 实时显示解析和上传进度
 */

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import {
  Upload,
  FileText,
  File,
  Table2,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react';
import { fileParser } from '../lib/file-parser';
import { supabase } from '../lib/supabase';

const sequenceOptions = ['市场（营销）', '市场（销售）', '供应链（生产）', '供应链（采购）', '供应链（营运）', '财务管理', '人力资源', '智能与数字化', '战略管理', '行政管理', '研发', '党群', '纪检', '法律合规', 'EHS', '审计'];
const levelOptions = ['基层', '经理层', '专业总监', '干部'];
const roleOptions = ['全角色', '个人贡献者/BP', '带团队负责人'];

interface FileUploadItem {
  id: string;
  file: File;
  status: 'pending' | 'parsing' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  parsedContent?: string;
}

interface FileUploaderProps {
  onUploadComplete?: () => void;
}

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadItems, setUploadItems] = useState<FileUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [defaultSequence, setDefaultSequence] = useState('全员通用');
  const [defaultLevel, setDefaultLevel] = useState('全职级');
  const [defaultRole, setDefaultRole] = useState('全角色');

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(file => fileParser.isValidFile(file));

    if (validFiles.length === 0) {
      alert('请上传有效的文件格式 (PDF, Word, Excel, TXT)');
      return;
    }

    const newItems: FileUploadItem[] = validFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }));

    setUploadItems(prev => [...prev, ...newItems]);
    processFiles(newItems);
  };

  const processFiles = async (items: FileUploadItem[]) => {
    setIsUploading(true);

    for (const item of items) {
      try {
        updateItemStatus(item.id, 'parsing', 25);

        const parsed = await fileParser.parseFile(item.file);

        updateItemStatus(item.id, 'uploading', 50, parsed.content);

        const { error: docError } = await supabase
          .from('knowledge_docs')
          .insert({
            title: parsed.fileName,
            content: parsed.content,
            tag_sequence: defaultSequence,
            tag_level: defaultLevel,
            tag_role_type: defaultRole,
            is_chunked: false,
          })
          .select()
          .single();

        if (docError) {
          throw new Error(`上传失败: ${docError.message}`);
        }

        updateItemStatus(item.id, 'success', 100);
      } catch (error) {
        console.error('File processing error:', error);
        updateItemStatus(
          item.id,
          'error',
          0,
          undefined,
          (error as Error).message
        );
      }
    }

    setIsUploading(false);

    if (onUploadComplete) {
      onUploadComplete();
    }
  };

  const updateItemStatus = (
    id: string,
    status: FileUploadItem['status'],
    progress: number,
    parsedContent?: string,
    error?: string
  ) => {
    setUploadItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, status, progress, parsedContent, error }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    setUploadItems(prev => prev.filter(item => item.id !== id));
  };

  const clearCompleted = () => {
    setUploadItems(prev =>
      prev.filter(item => item.status !== 'success' && item.status !== 'error')
    );
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return <File className="w-5 h-5 text-red-500" />;
      case 'docx':
      case 'doc':
        return <FileText className="w-5 h-5 text-blue-500" />;
      case 'xlsx':
      case 'xls':
        return <Table2 className="w-5 h-5 text-green-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: FileUploadItem['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'parsing':
      case 'uploading':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3">上传标签</h4>
        <p className="text-sm text-gray-500 mb-4">
          为即将上传的文档选择适用的序列 / 职级 / 角色标签，系统会基于这些标签进行角色化检索。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">角色类型</label>
            <select
              value={defaultLevel}
              onChange={(e) => setDefaultLevel(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {levelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">专业序列</label>
            <select
              value={defaultSequence}
              onChange={(e) => setDefaultSequence(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sequenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.txt"
          onChange={handleFileInput}
          className="hidden"
        />

        <div className="text-center">
          <Upload
            className={`w-12 h-12 mx-auto mb-4 ${
              isDragging ? 'text-blue-600' : 'text-gray-400'
            }`}
          />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {isDragging ? '释放文件以上传' : '拖拽文件到此处上传'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            支持 PDF、Word、Excel、TXT 格式
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            disabled={isUploading}
          >
            选择文件
          </button>
        </div>
      </div>

      {uploadItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">
              上传列表 ({uploadItems.length})
            </h4>
            {uploadItems.some(
              item => item.status === 'success' || item.status === 'error'
            ) && (
              <button
                onClick={clearCompleted}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                清除已完成
              </button>
            )}
          </div>

          <div className="space-y-3">
            {uploadItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-shrink-0">
                  {getFileIcon(item.file.name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.file.name}
                    </p>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      {item.status !== 'success' && item.status !== 'error' && (
                        <span className="text-sm text-gray-500">
                          {item.progress}%
                        </span>
                      )}
                    </div>
                  </div>

                  {(item.status === 'parsing' ||
                    item.status === 'uploading') && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}

                  {item.status === 'success' && (
                    <p className="text-xs text-green-600">上传成功</p>
                  )}

                  {item.error && (
                    <p className="text-xs text-red-600">{item.error}</p>
                  )}
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
                  disabled={
                    item.status === 'parsing' || item.status === 'uploading'
                  }
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
