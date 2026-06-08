import type { WorkspaceItem } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { mockWorkspaceService } from '@/mock/mockService';
import { workspaceApi } from '@/api/workspaceApi';

export const getWorkspaces = async (params?: any): Promise<WorkspaceItem[]> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockWorkspaceService.getWorkspaces(params);
    if (res.code !== 0) throw new Error(res.message);
    return res.data.list;
  }
  return await workspaceApi.getWorkspaces(params);
};

export const createWorkspace = async (name: string): Promise<WorkspaceItem> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockWorkspaceService.createWorkspace(name);
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  return await workspaceApi.createWorkspace(name);
};
