import http from '@/services/index';
import type { BaseApiResponse } from '@/types';

export type DeploymentStatus =
  | 'queued'
  | 'running'
  | 'deployed'
  | 'failed'
  | 'stopped'
  | 'requires_config';

export interface DeploymentConfig {
  publicBaseUrl?: string;
  hostPort?: number;
  containerPort?: number;
  projectDir?: string;
  startCommand?: string;

  frontendDir?: string;
  backendDir?: string;
  frontendPort?: number;
  backendPort?: number;
  hostFrontendPort?: number;
  hostBackendPort?: number;
  frontendStartCommand?: string;
  backendStartCommand?: string;
}

export interface WorkspaceDeployment {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  conversationId?: string | null;
  runId?: string | null;
  status: DeploymentStatus;
  deployType: 'local_docker';
  projectType: string;
  serviceUrls: Record<string, string>;
  ports: Record<string, number>;
  containerIds: string[];
  config: Record<string, any>;
  logs: string;
  error: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  queuedReason?: string | null;
  queuePosition?: number | null;
  lockOwnerId?: string | null;
  lockFencingToken?: string | null;
}

export interface CreateDeploymentPayload {
  conversationId?: string;
  runId?: string;
  publicBaseUrl?: string;
  config?: DeploymentConfig;
  agentId?: string;
  targetAgentId?: string;
}

export interface DeploymentLogsResponse {
  deploymentId: string;
  logs: string;
  liveLogs: string;
}

export async function createDeployment(
  workspaceId: string,
  payload: CreateDeploymentPayload
): Promise<BaseApiResponse<WorkspaceDeployment>> {
  return await http.post(`/workspaces/${workspaceId}/deployments`, payload);
}

export async function getDeploymentHistory(
  workspaceId: string
): Promise<BaseApiResponse<{ list: WorkspaceDeployment[] }>> {
  return await http.get(`/workspaces/${workspaceId}/deployments`);
}

export async function getDeploymentDetail(
  deploymentId: string
): Promise<BaseApiResponse<WorkspaceDeployment>> {
  return await http.get(`/deployments/${deploymentId}`);
}

export async function stopDeployment(
  deploymentId: string
): Promise<BaseApiResponse<WorkspaceDeployment>> {
  return await http.post(`/deployments/${deploymentId}/stop`);
}

export async function getDeploymentLogs(
  deploymentId: string
): Promise<BaseApiResponse<DeploymentLogsResponse>> {
  return await http.get(`/deployments/${deploymentId}/logs`);
}

const deploymentService = {
  createDeployment,
  getDeploymentHistory,
  getDeploymentDetail,
  stopDeployment,
  getDeploymentLogs,
};

export default deploymentService;
