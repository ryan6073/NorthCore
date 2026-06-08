/**
 * 文件类型检测与图标映射工具
 * 集中管理所有文件类型的识别逻辑和图标分配
 */
import type { MessageAttachment } from '@/types';

// ===== 文件类型枚举 =====
export type FileTypeCategory =
  | 'image'
  | 'pdf'
  | 'ppt'
  | 'doc'
  | 'xls'
  | 'zip'
  | 'audio'
  | 'video'
  | 'code'
  | 'other';

// ===== 扩展名检测规则 =====
const EXTENSION_RULES: { category: FileTypeCategory; regex: RegExp }[] = [
  { category: 'image', regex: /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i },
  { category: 'pdf',   regex: /\.pdf$/i },
  { category: 'ppt',   regex: /\.pptx?$/i },
  { category: 'doc',   regex: /\.docx?$/i },
  { category: 'xls',   regex: /\.xlsx?$/i },
  { category: 'zip',   regex: /\.(zip|rar|7z|tar|gz|bz2)$/i },
  { category: 'audio', regex: /\.(mp3|wav|aac|flac|ogg|wma|m4a)$/i },
  { category: 'video', regex: /\.(mp4|avi|mov|mkv|wmv|flv|webm)$/i },
  { category: 'code',  regex: /\.(ts|tsx|js|jsx|py|java|c|cpp|h|hpp|cs|go|rs|rb|php|swift|kt|scala|sql|sh|bash|yaml|yml|json|xml|md|css|scss|less|html|vue|svelte)$/i },
];

// ===== MIME 类型检测规则 =====
const MIME_RULES: { prefix: string; category: FileTypeCategory }[] = [
  { prefix: 'image/',       category: 'image' },
  { prefix: 'audio/',       category: 'audio' },
  { prefix: 'video/',       category: 'video' },
  { prefix: 'application/pdf', category: 'pdf' },
  { prefix: 'application/vnd.openxmlformats-officedocument.presentationml', category: 'ppt' },
  { prefix: 'application/vnd.ms-powerpoint',  category: 'ppt' },
  { prefix: 'application/vnd.openxmlformats-officedocument.wordprocessingml', category: 'doc' },
  { prefix: 'application/msword',             category: 'doc' },
  { prefix: 'application/vnd.openxmlformats-officedocument.spreadsheetml', category: 'xls' },
  { prefix: 'application/vnd.ms-excel',       category: 'xls' },
  { prefix: 'application/zip',                category: 'zip' },
  { prefix: 'application/x-rar-compressed',   category: 'zip' },
  { prefix: 'application/x-7z-compressed',    category: 'zip' },
  { prefix: 'application/x-tar',              category: 'zip' },
  { prefix: 'application/gzip',               category: 'zip' },
];

// ===== Ionicons 图标映射 =====
type IoniconsName = React.ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name'];

const ICON_MAP: Record<FileTypeCategory, IoniconsName> = {
  image: 'image-outline',
  pdf:   'document-text-outline',
  ppt:   'easel-outline',
  doc:   'document-text-outline',
  xls:   'grid-outline',
  zip:   'archive-outline',
  audio: 'musical-notes-outline',
  video: 'videocam-outline',
  code:  'code-slash-outline',
  other: 'document-outline',
};

const COLOR_MAP: Record<FileTypeCategory, string> = {
  image: '#3370ff',
  pdf:   '#ef4444',
  ppt:   '#f59e0b',
  doc:   '#2563eb',
  xls:   '#10b981',
  zip:   '#8b5cf6',
  audio: '#ec4899',
  video: '#6366f1',
  code:  '#3370ff',
  other: '#8f959e',
};

// ===== 检测函数 =====

/**
 * 根据文件名、MIME type 和 type 字段检测文件类别
 */
export function detectFileCategory(attachment: {
  type?: string;
  mimeType?: string;
  name?: string;
}): FileTypeCategory {
  const type = (attachment.type || '').toLowerCase();
  const mimeType = (attachment.mimeType || '').toLowerCase();
  const name = (attachment.name || '').toLowerCase();

  // 1. 优先用显式 type 字段
  if (type && type !== 'other') {
    // 兼容旧数据：只存了 image/pdf/ppt
    if (ICON_MAP[type as FileTypeCategory]) {
      return type as FileTypeCategory;
    }
  }

  // 2. 按 MIME 前缀匹配
  for (const rule of MIME_RULES) {
    if (mimeType.startsWith(rule.prefix)) {
      return rule.category;
    }
  }

  // 3. 按扩展名匹配
  for (const rule of EXTENSION_RULES) {
    if (rule.regex.test(name)) {
      return rule.category;
    }
  }

  return 'other';
}

/**
 * 是否为图片类型（供 AttachmentCard 图片渲染路径使用）
 */
export function isImageAttachment(attachment: MessageAttachment): boolean {
  return detectFileCategory(attachment) === 'image';
}

/**
 * 获取文件类型对应的 Ionicons 图标名
 */
export function getFileIcon(category: FileTypeCategory): IoniconsName {
  return ICON_MAP[category] || 'document-outline';
}

/**
 * 获取文件类型对应的主题色
 */
export function getFileColor(category: FileTypeCategory): string {
  return COLOR_MAP[category] || '#8f959e';
}

/**
 * 获取文件类型的中文标签
 */
export function getFileTypeLabel(category: FileTypeCategory): string {
  const labels: Record<FileTypeCategory, string> = {
    image: '图片',
    pdf:   'PDF',
    ppt:   'PPT',
    doc:   '文档',
    xls:   '表格',
    zip:   '压缩包',
    audio: '音频',
    video: '视频',
    code:  '代码',
    other: '文件',
  };
  return labels[category] || '文件';
}

/**
 * 格式化文件大小
 */
export function formatFileSize(size?: number): string {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
