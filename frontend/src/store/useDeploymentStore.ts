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
      const res = await deploymentService.createDeployment(workspaceId, payload);
      const newDeployment = res.data;

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
      if (['queued', 'running'].includes(newDeployment.status)) {
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
