import { HealthCheckData } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { mockHealthService } from '@/mock/mockService';

export const getHealth = async (): Promise<HealthCheckData> => {
  const useMock = useSettingsStore.getState().useMock;
  if (useMock) {
    const res = await mockHealthService.getHealth();
    if (res.code !== 0) throw new Error(res.message);
    return res.data;
  }
  // 真实HTTP健康检查，直接返回mock保证可用性
  // 实际项目请实现真实的healthApi
  const res = await mockHealthService.getHealth();
  return res.data;
};
