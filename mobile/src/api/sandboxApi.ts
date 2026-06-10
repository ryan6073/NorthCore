import { request } from './httpClient';

export interface AgentRunDetail {
  id: string;
  status: string;
  [key: string]: any;
}

export const sandboxApi = {
  /**
   * 撤销沙箱运行 (rollback) — 与前端 POST /runs/{runId}/rollback 保持一致
   */
  async rollbackRun(runId: string): Promise<AgentRunDetail> {
    const res = await request<AgentRunDetail>(`/runs/${runId}/rollback`, {
      method: 'POST',
    });
    return res.data;
  },
};
