import http from '@/services/index';
import type { HealthCheckData, BaseApiResponse } from '@/types';

export async function healthCheck(): Promise<BaseApiResponse<HealthCheckData>> {
  return await http.get('/health');
}

const healthService = {
  healthCheck,
};

export default healthService;
