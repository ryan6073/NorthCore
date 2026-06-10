import type { WorkspaceItem } from '@/types';
import { workspaceApi } from '@/api/workspaceApi';

export const getWorkspaces = async (params?: any): Promise<WorkspaceItem[]> => {
  return await workspaceApi.getWorkspaces(params);
};

export const createWorkspace = async (name: string): Promise<WorkspaceItem> => {
  return await workspaceApi.createWorkspace(name);
};
