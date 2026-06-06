import { create } from 'zustand';
import deploymentService, { 
  WorkspaceDeployment, 
  CreateDeploymentPayload, 
  DeploymentLogsResponse 
} from '@/services/http/deploymentService';

interface DeploymentState {
  deploymentsByWorkspaceId: Record<string, WorkspaceDeployment[]>;
  activeDeploymentByWorkspaceId: Record<string, WorkspaceDeployment | null>;
  deploymentLogs: Record<string, DeploymentLogsResponse | null>;
  isLoading: boolean;
  isLogsLoading: boolean;
  pollingIntervalId: any | null;

  fetchHistory: (workspaceId: string) => Promise<WorkspaceDeployment[]>;
  startDeploy: (workspaceId: string, payload: CreateDeploymentPayload) => Promise<WorkspaceDeployment>;
  stopDeploy: (deploymentId: string, workspaceId: string) => Promise<WorkspaceDeployment>;
  fetchLogs: (deploymentId: string) => Promise<DeploymentLogsResponse>;
  fetchDetail: (deploymentId: string, workspaceId: string) => Promise<WorkspaceDeployment>;
  startPolling: (deploymentId: string, workspaceId: string) => void;
  stopPolling: () => void;
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  deploymentsByWorkspaceId: {},
  activeDeploymentByWorkspaceId: {},
  deploymentLogs: {},
  isLoading: false,
  isLogsLoading: false,
  pollingIntervalId: null,

  fetchHistory: async (workspaceId) => {
    set({ isLoading: true });
    try {
      const res = await deploymentService.getDeploymentHistory(workspaceId);
      const list = res.data?.list || [];
      const sortedList = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      const active = sortedList.find(d => ['queued', 'running', 'requires_config'].includes(d.status)) || sortedList[0] || null;

      set((state) => ({
        deploymentsByWorkspaceId: {
          ...state.deploymentsByWorkspaceId,
          [workspaceId]: sortedList,
        },
        activeDeploymentByWorkspaceId: {
          ...state.activeDeploymentByWorkspaceId,
          [workspaceId]: active,
        },
      }));
      return sortedList;
    } catch (e) {
      console.error('Failed to fetch deployment history:', e);
      return [];
    } finally {
      set({ isLoading: false });
    }
  },

  startDeploy: async (workspaceId, payload) => {
    set({ isLoading: true });
    try {
      let res: any;
      // Use mock mode if VITE_USE_MOCK is true
      if ((import.meta as any).env?.VITE_USE_MOCK === 'true') {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const agentId = payload.targetAgentId || payload.agentId;
        const { mockAgents } = await import('@/mock');
        const agent = mockAgents.find((a) => a.id === agentId);
        const hasDeployTool = agent?.tools?.some((t) => t.id === 'deploy.run' && t.enabled) ?? false;

        if (!hasDeployTool) {
          res = {
            code: 40002,
            message: "当前 Agent 未启用 deploy.run，不能发起部署",
            data: null,
          };
        } else {
          const newId = 'dep-' + Math.random().toString(36).substring(2, 11);
          res = {
            code: 0,
            message: "success",
            data: {
              id: newId,
              workspaceId,
              ownerUserId: 'user-mock',
              conversationId: payload.conversationId || null,
              runId: payload.runId || null,
              status: 'running',
              deployType: 'local_docker',
              projectType: 'node',
              serviceUrls: {},
              ports: {},
              containerIds: [newId + '-container'],
              config: payload.config || {},
              logs: 'Building Docker image...\nStep 1/5 : FROM node:18-alpine\nStep 2/5 : WORKDIR /app\nStep 3/5 : COPY . .\nStep 4/5 : RUN npm install\nStep 5/5 : CMD ["npm", "run", "dev"]',
              error: '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as WorkspaceDeployment,
          };
        }
      } else {
        res = await deploymentService.createDeployment(workspaceId, payload);
      }

      if (res && res.code === 40002) {
        throw new Error(res.message || "当前 Agent 未启用 deploy.run，不能发起部署");
      }
      if (res && res.code !== 0) {
        throw new Error(res.message || "部署请求失败");
      }
      const newDeployment = res.data as WorkspaceDeployment;

      // Update history & active deployment
      set((state) => {
        const currentList = state.deploymentsByWorkspaceId[workspaceId] || [];
        const updatedList = [newDeployment, ...currentList];
        return {
          deploymentsByWorkspaceId: {
            ...state.deploymentsByWorkspaceId,
            [workspaceId]: updatedList,
          },
          activeDeploymentByWorkspaceId: {
            ...state.activeDeploymentByWorkspaceId,
            [workspaceId]: newDeployment,
          },
        };
      });

      // Start polling
      if (newDeployment && ['queued', 'running'].includes(newDeployment.status)) {
        get().startPolling(newDeployment.id, workspaceId);
      }

      return newDeployment;
    } finally {
      set({ isLoading: false });
    }
  },

  stopDeploy: async (deploymentId, workspaceId) => {
    set({ isLoading: true });
    try {
      const res = await deploymentService.stopDeployment(deploymentId);
      const updatedDeployment = res.data;

      set((state) => {
        const currentList = state.deploymentsByWorkspaceId[workspaceId] || [];
        const updatedList = currentList.map((d) => 
          d.id === updatedDeployment.id ? updatedDeployment : d
        );
        const currentActive = state.activeDeploymentByWorkspaceId[workspaceId];
        const newActive = currentActive?.id === updatedDeployment.id ? updatedDeployment : currentActive;

        return {
          deploymentsByWorkspaceId: {
            ...state.deploymentsByWorkspaceId,
            [workspaceId]: updatedList,
          },
          activeDeploymentByWorkspaceId: {
            ...state.activeDeploymentByWorkspaceId,
            [workspaceId]: newActive,
          },
        };
      });

      get().stopPolling();
      return updatedDeployment;
    } finally {
      set({ isLoading: false });
    }
  },

  fetchLogs: async (deploymentId) => {
    set({ isLogsLoading: true });
    try {
      const res = await deploymentService.getDeploymentLogs(deploymentId);
      const logs = res.data;
      set((state) => ({
        deploymentLogs: {
          ...state.deploymentLogs,
          [deploymentId]: logs,
        },
      }));
      return logs;
    } finally {
      set({ isLogsLoading: false });
    }
  },

  fetchDetail: async (deploymentId, workspaceId) => {
    const res = await deploymentService.getDeploymentDetail(deploymentId);
    const detail = res.data;

    set((state) => {
      const currentList = state.deploymentsByWorkspaceId[workspaceId] || [];
      const exists = currentList.some((d) => d.id === detail.id);
      const updatedList = exists
        ? currentList.map((d) => d.id === detail.id ? detail : d)
        : [detail, ...currentList];
      const currentActive = state.activeDeploymentByWorkspaceId[workspaceId];
      const newActive = (currentActive?.id === detail.id || !currentActive) ? detail : currentActive;

      return {
        deploymentsByWorkspaceId: {
          ...state.deploymentsByWorkspaceId,
          [workspaceId]: updatedList,
        },
        activeDeploymentByWorkspaceId: {
          ...state.activeDeploymentByWorkspaceId,
          [workspaceId]: newActive,
        },
      };
    });

    return detail;
  },

  startPolling: (deploymentId, workspaceId) => {
    get().stopPolling();
    const intervalId = setInterval(async () => {
      try {
        const detail = await get().fetchDetail(deploymentId, workspaceId);
        if (!['queued', 'running'].includes(detail.status)) {
          get().stopPolling();
        }
      } catch (e) {
        console.error('Polling failed:', e);
        get().stopPolling();
      }
    }, 2000);

    set({ pollingIntervalId: intervalId });
  },

  stopPolling: () => {
    const intervalId = get().pollingIntervalId;
    if (intervalId) {
      clearInterval(intervalId);
      set({ pollingIntervalId: null });
    }
  },
}));
