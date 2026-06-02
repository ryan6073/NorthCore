import http from '@/services/index';
import type {
  ModelProvider,
  ModelCredential,
  ModelConfig,
  BaseApiResponse
} from '@/types';

// Model Providers
export async function getModelProviders(): Promise<BaseApiResponse<ModelProvider[]>> {
  return await http.get('/model-providers');
}

// Model Credentials
export async function getModelCredentials(): Promise<BaseApiResponse<ModelCredential[]>> {
  return await http.get('/model-credentials');
}

export async function createModelCredential(payload: {
  name: string;
  provider: string;
  credentialType: string;
  secret: string;
}): Promise<BaseApiResponse<ModelCredential>> {
  return await http.post('/model-credentials', payload);
}

export async function updateModelCredential(
  credentialId: string,
  payload: {
    name?: string;
    provider?: string;
    credentialType?: string;
    secret?: string;
  }
): Promise<BaseApiResponse<ModelCredential>> {
  return await http.put(`/model-credentials/${credentialId}`, payload);
}

export async function deleteModelCredential(credentialId: string): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/model-credentials/${credentialId}`);
}

// Model Configs
export async function getModelConfigs(): Promise<BaseApiResponse<ModelConfig[]>> {
  return await http.get('/model-configs');
}

export async function createModelConfig(payload: {
  name: string;
  provider: string;
  protocol: string;
  modelName: string;
  baseUrl?: string | null;
  credentialRef?: string | null;
  extraConfig: Record<string, any>;
}): Promise<BaseApiResponse<ModelConfig>> {
  return await http.post('/model-configs', payload);
}

export async function updateModelConfig(
  configId: string,
  payload: {
    name?: string;
    provider?: string;
    protocol?: string;
    modelName?: string;
    baseUrl?: string | null;
    credentialRef?: string | null;
    extraConfig?: Record<string, any>;
  }
): Promise<BaseApiResponse<ModelConfig>> {
  return await http.put(`/model-configs/${configId}`, payload);
}

export async function deleteModelConfig(configId: string): Promise<BaseApiResponse<boolean>> {
  return await http.delete(`/model-configs/${configId}`);
}

// Test Connection
export interface ModelConfigTestResult {
  ok: boolean;
  provider: string;
  protocol: string;
  modelName: string;
  latencyMs: number;
  error: string | null;
}

export async function testModelConfig(configId: string): Promise<BaseApiResponse<ModelConfigTestResult>> {
  return await http.post(`/model-configs/${configId}/test`);
}

const modelService = {
  getModelProviders,
  getModelCredentials,
  createModelCredential,
  updateModelCredential,
  deleteModelCredential,
  getModelConfigs,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  testModelConfig,
};

export default modelService;
