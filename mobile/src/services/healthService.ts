import { HealthCheckData } from '@/types';

export const getHealth = async (): Promise<HealthCheckData> => {
  throw new Error('healthService not implemented — add real healthApi in src/api/');
};
