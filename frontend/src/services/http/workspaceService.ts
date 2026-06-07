import http from '@/services/index';
import type { BaseApiResponse, PaginatedData } from '@/types';

export interface WorkspaceItem {
  id: string;
  name: string;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  conversationCount: number;
  lastUsedAt: string | null;
}

export interface WorkspaceTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: WorkspaceTreeNode[];
  truncated?: boolean;
  reason?: string;
  maxDepth?: number;
  maxEntries?: number;
}

export interface FileContentData {
  path: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  isText: boolean;
  encoding: string;
  content: string;
  truncated: boolean;
}

export interface GetWorkspacesParams {
  status?: 'active' | 'deleted' | 'all';
  page?: number;
  pageSize?: number;
}

export async function getWorkspaces(
  params?: GetWorkspacesParams
): Promise<BaseApiResponse<PaginatedData<WorkspaceItem>>> {
  return await http.get('/workspaces', {
    params: {
      status: 'active',
      page: 1,
      pageSize: 20,
      ...params,
    },
  });
}

export async function createWorkspace(name: string): Promise<BaseApiResponse<WorkspaceItem>> {
  return await http.post('/workspaces', { name });
}

export async function renameWorkspace(
  workspaceId: string,
  name: string
): Promise<BaseApiResponse<WorkspaceItem>> {
  return await http.patch(`/workspaces/${workspaceId}`, { name });
}

export async function deleteWorkspace(workspaceId: string): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/workspaces/${workspaceId}`);
}

export async function restoreWorkspace(workspaceId: string): Promise<BaseApiResponse<WorkspaceItem>> {
  return await http.post(`/workspaces/${workspaceId}/restore`);
}

export async function purgeWorkspace(workspaceId: string): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/workspaces/${workspaceId}/purge`);
}

export async function getFileTree(
  workspaceId: string,
  maxDepth = 6,
  maxEntries = 2000
): Promise<BaseApiResponse<WorkspaceTreeNode>> {
  return await http.get(`/workspaces/${workspaceId}/files/tree`, {
    params: { maxDepth, maxEntries },
  });
}

export async function getFileContent(
  workspaceId: string,
  path: string
): Promise<BaseApiResponse<FileContentData>> {
  return await http.get(`/workspaces/${workspaceId}/files/content`, {
    params: { path },
  });
}

export async function saveFileContent(
  workspaceId: string,
  path: string,
  content: string,
  baseSha256: string
): Promise<BaseApiResponse<any>> {
  return await http.put(
    `/workspaces/${workspaceId}/files/content`,
    { content, baseSha256 },
    { params: { path } }
  );
}

export async function uploadFile(
  workspaceId: string,
  dir: string,
  file: File
): Promise<BaseApiResponse<any>> {
  const formData = new FormData();
  formData.append('file', file);
  return await http.post(`/workspaces/${workspaceId}/files/upload`, formData, {
    params: { dir },
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export function getDownloadUrl(workspaceId: string, path: string): string {
  const baseURL = http.defaults.baseURL || '/api/v1';
  return `${baseURL}/workspaces/${workspaceId}/files/download?path=${encodeURIComponent(path)}`;
}

const workspaceService = {
  getWorkspaces,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  restoreWorkspace,
  purgeWorkspace,
  getFileTree,
  getFileContent,
  saveFileContent,
  uploadFile,
  getDownloadUrl,
};

export default workspaceService;
