import { request } from './httpClient';
import type { 
  BaseApiResponse, 
  PaginatedData, 
  WorkspaceItem, 
  WorkspaceTreeNode, 
  FileContentData, 
  GetWorkspacesParams 
} from '@/types';

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export const workspaceApi = {
  async getWorkspaces(params?: GetWorkspacesParams): Promise<WorkspaceItem[]> {
    const res = await request<BaseApiResponse<PaginatedData<WorkspaceItem>>>('/workspaces', {
      method: 'GET',
      params: {
        status: 'active',
        page: 1,
        pageSize: 20,
        ...params,
      },
    });
    if (res.data?.list) return res.data.list;
    if (Array.isArray(res.data)) return res.data;
    return [];
  },

  async createWorkspace(name: string): Promise<WorkspaceItem> {
    const res = await request<BaseApiResponse<WorkspaceItem>>('/workspaces', {
      method: 'POST',
      data: { name },
    });
    return res.data;
  },

  async renameWorkspace(
    workspaceId: string,
    name: string
  ): Promise<BaseApiResponse<WorkspaceItem>> {
    return await request<BaseApiResponse<WorkspaceItem>>(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      data: { name },
    });
  },

  async deleteWorkspace(workspaceId: string): Promise<BaseApiResponse<boolean>> {
    return await request<BaseApiResponse<boolean>>(`/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });
  },

  async restoreWorkspace(workspaceId: string): Promise<BaseApiResponse<WorkspaceItem>> {
    return await request<BaseApiResponse<WorkspaceItem>>(`/workspaces/${workspaceId}/restore`, {
      method: 'POST',
    });
  },

  async purgeWorkspace(workspaceId: string): Promise<BaseApiResponse<boolean>> {
    return await request<BaseApiResponse<boolean>>(`/workspaces/${workspaceId}/purge`, {
      method: 'DELETE',
    });
  },

  async getFileTree(
    workspaceId: string,
    maxDepth = 6,
    maxEntries = 2000
  ): Promise<BaseApiResponse<WorkspaceTreeNode>> {
    return await request<BaseApiResponse<WorkspaceTreeNode>>(`/workspaces/${workspaceId}/files/tree`, {
      method: 'GET',
      params: { maxDepth, maxEntries },
    });
  },

  async getFileContent(
    workspaceId: string,
    path: string
  ): Promise<BaseApiResponse<FileContentData>> {
    return await request<BaseApiResponse<FileContentData>>(`/workspaces/${workspaceId}/files/content`, {
      method: 'GET',
      params: { path },
    });
  },

  async saveFileContent(
    workspaceId: string,
    path: string,
    content: string,
    baseSha256: string
  ): Promise<BaseApiResponse<any>> {
    return await request<BaseApiResponse<any>>(`/workspaces/${workspaceId}/files/content`, {
      method: 'PUT',
      data: { content, baseSha256 },
      params: { path },
    });
  },
};
