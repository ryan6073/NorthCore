import { request } from './httpClient';

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export const workspaceApi = {
  async getWorkspaces(): Promise<Workspace[]> {
    const res = await request<Workspace[]>('/workspaces', {
      method: 'GET',
    });
    return res.data;
  },

  async createWorkspace(name: string): Promise<Workspace> {
    const res = await request<Workspace>('/workspaces', {
      method: 'POST',
      data: { name },
    });
    return res.data;
  },
};
