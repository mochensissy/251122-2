/**
 * 文件解析工具
 *
 * 支持的文件格式:
 * 1. PDF - 使用pdfjs-dist解析
 * 2. Word (.docx) - 使用mammoth解析
 * 3. Excel (.xlsx, .xls) - 使用xlsx解析
 * 4. 文本文件 (.txt)
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ParsedFile {
  fileName: string;
  fileType: string;
  content: string;
  pageCount?: number;
  metadata?: Record<string, any>;
}

export class FileParser {
  /**
   * 解析PDF文件
   */
  async parsePDF(file: File): Promise<ParsedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const pageCount = pdf.numPages;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }

    return {
      fileName: file.name,
      fileType: 'pdf',
      content: fullText.trim(),
      pageCount,
      metadata: {
        size: file.size,
        lastModified: file.lastModified,
      }
    };
  }

  /**
   * 解析Word文档(.docx)
   */
  async parseWord(file: File): Promise<ParsedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });

    return {
      fileName: file.name,
      fileType: 'docx',
      content: result.value.trim(),
      metadata: {
        size: file.size,
        lastModified: file.lastModified,
        messages: result.messages,
      }
    };
  }

  /**
   * 解析Excel文件(.xlsx, .xls)
   */
  async parseExcel(file: File): Promise<ParsedFile> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    let fullText = '';

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetText = XLSX.utils.sheet_to_txt(worksheet, { blankrows: false });
      fullText += `[${sheetName}]\n${sheetText}\n\n`;
    });

    return {
      fileName: file.name,
      fileType: 'excel',
      content: fullText.trim(),
      metadata: {
        size: file.size,
        lastModified: file.lastModified,
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
      }
    };
  }

  /**
   * 解析文本文件(.txt)
   */
  async parseText(file: File): Promise<ParsedFile> {
    const text = await file.text();

    return {
      fileName: file.name,
      fileType: 'txt',
      content: text.trim(),
      metadata: {
        size: file.size,
        lastModified: file.lastModified,
      }
    };
  }

  /**
   * 自动识别并解析文件
   */
  async parseFile(file: File): Promise<ParsedFile> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'pdf':
        return this.parsePDF(file);

      case 'docx':
      case 'doc':
        return this.parseWord(file);

      case 'xlsx':
      case 'xls':
        return this.parseExcel(file);

      case 'txt':
        return this.parseText(file);

      default:
        throw new Error(`不支持的文件格式: .${extension}`);
    }
  }

  /**
   * 验证文件格式
   */
  isValidFile(file: File): boolean {
    const validExtensions = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'txt'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? validExtensions.includes(extension) : false;
  }

  /**
   * 获取文件类型描述
   */
  getFileTypeDescription(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const descriptions: Record<string, string> = {
      'pdf': 'PDF文档',
      'docx': 'Word文档',
      'doc': 'Word文档',
      'xlsx': 'Excel表格',
      'xls': 'Excel表格',
      'txt': '文本文件',
    };
    return descriptions[extension || ''] || '未知格式';
  }
}

export const fileParser = new FileParser();
