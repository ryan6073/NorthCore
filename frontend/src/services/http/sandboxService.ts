import http from '@/services/index';
import type { BaseApiResponse, AgentRunDetail, SandboxFile, SandboxFileDetail, SandboxConflict } from '@/types';

export async function createSandboxRun(
  conversationId: string,
  prompt: string
): Promise<BaseApiResponse<AgentRunDetail>> {
  return await http.post(`/conversations/${conversationId}/runs`, { prompt });
}

export async function getSandboxRunDetail(
  runId: string
): Promise<BaseApiResponse<AgentRunDetail>> {
  return await http.get(`/runs/${runId}`);
}

export async function getSandboxFiles(
  runId: string
): Promise<BaseApiResponse<SandboxFile[]>> {
  return await http.get(`/runs/${runId}/files`);
}

export async function getSandboxFileContent(
  runId: string,
  filePath: string
): Promise<BaseApiResponse<SandboxFileDetail>> {
  const encodedPath = encodeURIComponent(filePath);
  return await http.get(`/runs/${runId}/files/${encodedPath}`);
}

export async function getSandboxConflicts(
  runId: string
): Promise<BaseApiResponse<SandboxConflict[]>> {
  return await http.get(`/runs/${runId}/conflicts`);
}

export async function resolveSandboxConflict(
  runId: string,
  conflictId: string,
  resolution: 'current' | 'incoming' | 'manual',
  content?: string
): Promise<BaseApiResponse<SandboxConflict>> {
  const payload: any = { resolution };
  if (resolution === 'manual' && content !== undefined) {
    payload.content = content;
  }
  return await http.post(`/runs/${runId}/conflicts/${conflictId}/resolve`, payload);
}

export async function cancelSandboxRun(
  runId: string
): Promise<BaseApiResponse<AgentRunDetail>> {
  return await http.post(`/runs/${runId}/cancel`);
}

const sandboxService = {
  createSandboxRun,
  getSandboxRunDetail,
  getSandboxFiles,
  getSandboxFileContent,
  getSandboxConflicts,
  resolveSandboxConflict,
  cancelSandboxRun,
};

export default sandboxService;
