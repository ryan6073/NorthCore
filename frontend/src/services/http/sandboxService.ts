import http from '@/services/index';
import type {
  BaseApiResponse,
  AgentRunDetail,
  SandboxFile,
  SandboxFileDetail,
  SandboxConflict,
  SandboxHtmlPreview,
  CreateSandboxRunRequest,
  PaginatedData,
  Workspace,
  WorkspaceTreeNode
} from '@/types';

export async function createSandboxRun(
  conversationId: string,
  payload: CreateSandboxRunRequest
): Promise<BaseApiResponse<AgentRunDetail>> {
  return await http.post(`/conversations/${conversationId}/runs`, payload);
}

export async function getSandboxRunList(
  conversationId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<BaseApiResponse<PaginatedData<AgentRunDetail>>> {
  return await http.get(`/conversations/${conversationId}/runs`, { params: { page, pageSize } });
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

export async function getSandboxHtmlPreview(
  runId: string,
  filePath: string
): Promise<BaseApiResponse<SandboxHtmlPreview>> {
  const encodedPath = encodeURIComponent(filePath);
  return await http.get(`/runs/${runId}/preview/${encodedPath}`);
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

export async function getWorkspaces(): Promise<BaseApiResponse<{ list: Workspace[] }>> {
  return await http.get('/workspaces');
}

export async function createWorkspace(payload: { name: string }): Promise<BaseApiResponse<Workspace>> {
  return await http.post('/workspaces', payload);
}

export async function getSandboxFileTree(runId: string): Promise<BaseApiResponse<WorkspaceTreeNode>> {
  return await http.get(`/runs/${runId}/files/tree`);
}

const sandboxService = {
  createSandboxRun,
  getSandboxRunList,
  getSandboxRunDetail,
  getSandboxFiles,
  getSandboxFileContent,
  getSandboxHtmlPreview,
  getSandboxConflicts,
  resolveSandboxConflict,
  cancelSandboxRun,
  getWorkspaces,
  createWorkspace,
  getSandboxFileTree,
};

export default sandboxService;
