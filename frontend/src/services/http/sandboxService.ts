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
  WorkspaceTreeNode,
  RetryRunResponse,
  RunFile,
  RunFileDetail
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

export async function rollbackSandboxRun(
  runId: string
): Promise<BaseApiResponse<AgentRunDetail>> {
  return await http.post(`/runs/${runId}/rollback`);
}

export async function retrySandboxRun(
  runId: string
): Promise<BaseApiResponse<RetryRunResponse>> {
  return await http.post(`/runs/${runId}/retry`);
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

function encodeFilePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function canDownload(
  fileOrArtifact: {
    downloadUrl?: string;
    path?: string;
    filePath?: string;
    runId?: string;
  }
): boolean {
  return Boolean(
    fileOrArtifact.downloadUrl ||
      (fileOrArtifact.runId && (fileOrArtifact.filePath || fileOrArtifact.path))
  );
}

export function getDownloadUrl(item: any, apiBaseUrl?: string): string {
  if (item.downloadUrl) {
    if (apiBaseUrl && !item.downloadUrl.startsWith('http')) {
      const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      const path = item.downloadUrl.startsWith('/') ? item.downloadUrl : `/${item.downloadUrl}`;
      if (path.startsWith('/api/v1') && base.endsWith('/api/v1')) {
        return base.slice(0, -7) + path;
      }
      if (path.startsWith(base)) {
        return path;
      }
      return `${base}${path}`;
    }
    return item.downloadUrl;
  }
  const path = item.filePath || item.path;
  return `/api/v1/runs/${item.runId}/files/${encodeFilePath(path)}/download`;
}

export async function downloadSandboxFile(runId: string, filePath: string): Promise<Blob> {
  const encodedPath = encodeFilePath(filePath);
  return await http.get(`/runs/${runId}/files/${encodedPath}/download`, {
    responseType: 'blob'
  });
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
  rollbackSandboxRun,
  retrySandboxRun,
  getWorkspaces,
  createWorkspace,
  getSandboxFileTree,
  downloadSandboxFile,
  encodeFilePath,
  canDownload,
  getDownloadUrl,
};

export default sandboxService;
