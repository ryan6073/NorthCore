import { canDownload, getDownloadUrl } from './sandboxService';

let baseURL: string = '/api/v1';
try {
  baseURL = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';
} catch {
  baseURL = '/api/v1';
}

export type FileType = 'text' | 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'image' | 'unknown';

export interface FileInfo {
  name: string;
  type: FileType;
  mimeType?: string;
  size?: number;
  isText?: boolean;
}

export function getFileInfo(
  item: {
    path?: string;
    filePath?: string;
    mimeType?: string;
    isText?: boolean;
  }
): FileInfo {
  const filePath = item.filePath || item.path || '';
  const fileName = filePath.split('/').pop() || 'unknown';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let type: FileType = 'unknown';
  let isText = item.isText ?? false;

  if (isText || ['txt', 'md', 'html', 'htm', 'css', 'js', 'json', 'csv', 'xml', 'yaml', 'yml'].includes(ext)) {
    type = 'text';
  } else if (ext === 'pdf') {
    type = 'pdf';
  } else if (ext === 'pptx' || ext === 'ppt') {
    type = 'pptx';
  } else if (ext === 'docx' || ext === 'doc') {
    type = 'docx';
  } else if (ext === 'xlsx' || ext === 'xls') {
    type = 'xlsx';
  } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    type = 'image';
  }

  return {
    name: fileName,
    type,
    mimeType: item.mimeType,
    size: undefined,
    isText,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function fetchFileWithAuth(url: string): Promise<Blob> {
  const token = localStorage.getItem('auth_token');
  let fullUrl = url;
  if (!url.startsWith('http')) {
    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    const path = url.startsWith('/') ? url : `/${url}`;
    if (path.startsWith('/api/v1') && base.endsWith('/api/v1')) {
      fullUrl = base.slice(0, -7) + path;
    } else if (path.startsWith(base)) {
      fullUrl = path;
    } else {
      fullUrl = `${base}${path}`;
    }
  }

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('文件已过期或工作区已清理，无法下载。');
    }
    throw new Error(`下载失败: ${response.statusText}`);
  }

  return await response.blob();
}

export async function fetchArrayBufferWithAuth(url: string): Promise<ArrayBuffer> {
  const token = localStorage.getItem('auth_token');
  let fullUrl = url;
  if (!url.startsWith('http')) {
    const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    const path = url.startsWith('/') ? url : `/${url}`;
    if (path.startsWith('/api/v1') && base.endsWith('/api/v1')) {
      fullUrl = base.slice(0, -7) + path;
    } else if (path.startsWith(base)) {
      fullUrl = path;
    } else {
      fullUrl = `${base}${path}`;
    }
  }

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('文件已过期或工作区已清理，无法下载。');
    }
    throw new Error(`下载失败: ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

export async function downloadFile(
  item: {
    downloadUrl?: string;
    path?: string;
    filePath?: string;
    runId?: string;
  }
): Promise<void> {
  if (!canDownload(item)) {
    throw new Error('无法下载该文件：缺少必要的下载信息');
  }

  const url = getDownloadUrl(item, baseURL);
  const blob = await fetchFileWithAuth(url);
  const objectURL = URL.createObjectURL(blob);

  const fileName = (item.filePath || item.path || 'download').split('/').pop() || 'download';

  const a = document.createElement('a');
  a.href = objectURL;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(objectURL), 100);
}

export function createObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

export { canDownload, getDownloadUrl };

const filePreviewService = {
  getFileInfo,
  formatFileSize,
  fetchFileWithAuth,
  fetchArrayBufferWithAuth,
  downloadFile,
  createObjectURL,
  revokeObjectURL,
  canDownload,
  getDownloadUrl,
};

export default filePreviewService;
