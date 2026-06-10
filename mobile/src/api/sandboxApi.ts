import { request } from './httpClient';

export interface AgentRunDetail {
  id: string;
  status: string;
  [key: string]: any;
}

export const sandboxApi = {
  /**
   * 查询沙箱运行详情
   */
  async getRunDetail(runId: string): Promise<AgentRunDetail> {
    const res = await request<AgentRunDetail>(`/runs/${runId}`, {
      method: 'GET',
    });
    return res.data;
  },

  /**
   * 撤销沙箱运行 (rollback)
   */
  async rollbackRun(runId: string): Promise<AgentRunDetail> {
    const res = await request<AgentRunDetail>(`/runs/${runId}/rollback`, {
      method: 'POST',
    });
    return res.data;
  },
};
