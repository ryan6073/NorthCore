// Platform Adapter Layer to isolate Electron Desktop vs Web Environment


declare global {
  interface Window {
    northcoreDesktop?: {
      isDesktop: boolean;
      platform: string;
      getVersion: () => Promise<string>;
      getNodeVersion: () => Promise<string>;
      getArch: () => Promise<string>;
      getPlatformName: () => Promise<string>;
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };
      dialog: {
        selectDirectory: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
        selectFile: (filters?: any) => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
      };
      file: {
        readText: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        writeText: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
        openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        revealInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      };
      workspace: {
        getCurrent: () => Promise<{ success: boolean; workspace: any; status: string }>;
        setCurrent: (workspacePath: string) => Promise<{ success: boolean; workspace?: any; status?: string; error?: string }>;
        clearCurrent: () => Promise<{ success: boolean; error?: string }>;
        getRecent: () => Promise<{ success: boolean; workspaces: any[]; error?: string }>;
        removeRecent: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
        checkStatus: (workspacePath: string) => Promise<{ success: boolean; status: string; error?: string }>;
        scanFiles: (workspacePath: string, ignorePatterns?: string[]) => Promise<{ success: boolean; files?: any[]; error?: string }>;
      };
      notification: {
        show: (options: { title: string; body: string; silent?: boolean; onClick?: boolean; callbackId?: string }) => Promise<{ success: boolean; error?: string }>;
        taskCompleted: (taskName: string) => Promise<{ success: boolean; error?: string }>;
        artifactCreated: (artifactName: string) => Promise<{ success: boolean; error?: string }>;
        artifactApplied: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        checkSupport: () => Promise<{ supported: boolean }>;
        onNotificationClicked: (callback: (callbackId: string) => void) => void;
      };
      agentProcess: {
        list: () => Promise<{ success: boolean; agents: any[]; error?: string }>;
        start: (agentId: string) => Promise<{ success: boolean; agent?: any; error?: string }>;
        stop: (agentId: string) => Promise<{ success: boolean; agent?: any; error?: string }>;
        restart: (agentId: string) => Promise<{ success: boolean; agent?: any; error?: string }>;
        logs: (agentId: string) => Promise<{ success: boolean; logs?: string[]; error?: string }>;
        status: (agentId: string) => Promise<{ success: boolean; status?: string; error?: string }>;
      };
      settings: {
        get: () => Promise<{ success: boolean; settings?: any; error?: string }>;
        set: (newSettings: any) => Promise<{ success: boolean; error?: string }>;
        reset: () => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  children?: FileNode[];
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  openedAt?: string;
  status: 'none' | 'loading' | 'active' | 'unavailable' | 'error';
}

export interface AgentProcessInfo {
  id: string;
  name: string;
  provider: string;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  port: number;
  pid: number | null;
  command: string;
  workDir: string;
  logs: string[];
}

// Desktop mock testing modes
const DESKTOP_MODES = {
  WEB: 'web',
  MOCK_DESKTOP: 'mock-desktop',
  REAL_DESKTOP: 'real-desktop'
} as const;

let currentDesktopMode = DESKTOP_MODES.WEB;
try {
  const storedMode = localStorage.getItem('ag_desktop_mock_mode');
  if (storedMode && Object.values(DESKTOP_MODES).includes(storedMode as any)) {
    currentDesktopMode = storedMode as any;
  }
} catch (e) {
  console.warn('Failed to restore desktop mode', e);
}

// In-memory mock storage for Web environment
const webState = {
  currentWorkspace: null as WorkspaceInfo | null,
  recentWorkspaces: [] as WorkspaceInfo[],
  settings: {
    theme: 'light',
    allowRead: true,
    allowWrite: true,
    confirmBeforeWrite: true,
    defaultSaveDir: '',
    autoOverwrite: false,
    enableNotifications: true,
    notifyOnTaskCompleted: true,
    notifyOnArtifactCreated: true,
    notifyOnAgentError: true,
  },
  agentProcesses: [
    {
      id: 'local-qwen',
      name: 'Local Qwen',
      provider: 'local-qwen',
      status: 'stopped',
      port: 8000,
      pid: null,
      command: 'python -m vllm.entrypoints.openai.api --model Qwen/Qwen2.5-7B-Instruct',
      workDir: '/mock/workspace/NorthCore',
      logs: [],
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      provider: 'opencode',
      status: 'stopped',
      port: 8001,
      pid: null,
      command: 'npm run start',
      workDir: '/mock/workspace/NorthCore',
      logs: [],
    },
    {
      id: 'codex',
      name: 'Codex',
      provider: 'codex',
      status: 'stopped',
      port: 8002,
      pid: null,
      command: 'python codex/main.py',
      workDir: '/mock/workspace/NorthCore',
      logs: [],
    }
  ] as AgentProcessInfo[],
  mockFiles: {
    '/mock/workspace/NorthCore': [
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          { name: 'App.tsx', path: 'src/App.tsx', type: 'file', extension: 'tsx' },
          { name: 'index.css', path: 'src/index.css', type: 'file', extension: 'css' },
          { name: 'main.tsx', path: 'src/main.tsx', type: 'file', extension: 'tsx' }
        ]
      },
      {
        name: 'public',
        path: 'public',
        type: 'directory',
        children: [
          { name: 'favicon.ico', path: 'public/favicon.ico', type: 'file', extension: 'ico' },
          { name: 'index.html', path: 'public/index.html', type: 'file', extension: 'html' }
        ]
      },
      { name: 'package.json', path: 'package.json', type: 'file', extension: 'json' },
      { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file', extension: 'json' },
      { name: 'README.md', path: 'README.md', type: 'file', extension: 'md' }
    ]
  } as Record<string, FileNode[]>
};

// Initialize web state from localStorage if available
try {
  const storedWorkspace = localStorage.getItem('ag_web_current_workspace');
  if (storedWorkspace) {
    webState.currentWorkspace = JSON.parse(storedWorkspace);
  }
  const storedRecent = localStorage.getItem('ag_web_recent_workspaces');
  if (storedRecent) {
    webState.recentWorkspaces = JSON.parse(storedRecent);
  }
  const storedSettings = localStorage.getItem('ag_web_settings');
  if (storedSettings) {
    webState.settings = { ...webState.settings, ...JSON.parse(storedSettings) };
  }
} catch (e) {
  console.warn('Failed to restore webState', e);
}

export const platform = {
  isDesktop(): boolean {
    return !!(window.northcoreDesktop && window.northcoreDesktop.isDesktop) || 
           (currentDesktopMode as any) === DESKTOP_MODES.MOCK_DESKTOP;
  },

  getPlatformName(): string {
    return this.isDesktop() ? window.northcoreDesktop!.platform : 'Web Browser';
  },

  // Window APIs
  window: {
    minimize: () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.window.minimize();
      console.log('Window minimize requested (Web mock)');
      return Promise.resolve();
    },
    maximize: () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.window.maximize();
      console.log('Window maximize requested (Web mock)');
      return Promise.resolve();
    },
    close: () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.window.close();
      console.log('Window close requested (Web mock)');
      return Promise.resolve();
    },
  },

  // Dialog APIs
  dialog: {
    selectDirectory: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.dialog.selectDirectory();
      
      // Web mock directory selection
      const mockPaths = ['/mock/workspace/NorthCore', '/mock/projects/AgentHub', '/mock/source/LocalTest'];
      const randomPath = mockPaths[Math.floor(Math.random() * mockPaths.length)];
      return Promise.resolve({ success: true, path: randomPath });
    },
    selectFile: async (filters?: any) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.dialog.selectFile(filters);
      return Promise.resolve({ success: true, path: '/mock/workspace/NorthCore/src/App.tsx' });
    }
  },

  // File system APIs
  file: {
    readText: async (filePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.file.readText(filePath);
      
      // Web mock read
      if (filePath.endsWith('package.json')) {
        return {
          success: true,
          content: `{\n  "name": "northcore-app",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.2.0"\n  }\n}`
        };
      }
      if (filePath.endsWith('README.md')) {
        return {
          success: true,
          content: `# NorthCore Project\n\nThis is a mock project workspace loaded inside Web Browser mode.`
        };
      }
      return {
        success: true,
        content: `// Source code from ${filePath}\nexport function demo() {\n  console.log("Hello from NorthCore");\n}`
      };
    },
    writeText: async (filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
      if (platform.isDesktop()) return window.northcoreDesktop!.file.writeText(filePath, content);
      
      console.log(`Writing file to ${filePath} successfully (Web Mock)`);
      return Promise.resolve({ success: true });
    },
    openPath: async (filePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.file.openPath(filePath);
      alert(`[Open Path] Opening ${filePath} in native explorer/application (Mock)`);
      return Promise.resolve({ success: true });
    },
    revealInFolder: async (filePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.file.revealInFolder(filePath);
      alert(`[Reveal in Folder] Showing ${filePath} in system folder explorer (Mock)`);
      return Promise.resolve({ success: true });
    }
  },

  // Workspace APIs
  workspace: {
    getCurrent: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.getCurrent();
      
      return Promise.resolve({
        success: true,
        workspace: webState.currentWorkspace,
        status: webState.currentWorkspace ? 'active' : 'none'
      });
    },
    setCurrent: async (workspacePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.setCurrent(workspacePath);
      
      const workspace = {
        path: workspacePath,
        name: workspacePath.split('/').pop() || workspacePath,
        openedAt: new Date().toISOString(),
        status: 'active' as const
      };
      webState.currentWorkspace = workspace;
      
      // Update recent list
      const idx = webState.recentWorkspaces.findIndex(w => w.path === workspacePath);
      if (idx !== -1) webState.recentWorkspaces.splice(idx, 1);
      webState.recentWorkspaces.unshift(workspace);
      
      localStorage.setItem('ag_web_current_workspace', JSON.stringify(workspace));
      localStorage.setItem('ag_web_recent_workspaces', JSON.stringify(webState.recentWorkspaces));
      
      return Promise.resolve({ success: true, workspace });
    },
    clearCurrent: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.clearCurrent();
      
      webState.currentWorkspace = null;
      localStorage.removeItem('ag_web_current_workspace');
      return Promise.resolve({ success: true });
    },
    getRecent: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.getRecent();
      
      return Promise.resolve({ success: true, workspaces: webState.recentWorkspaces });
    },
    removeRecent: async (workspacePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.removeRecent(workspacePath);
      
      webState.recentWorkspaces = webState.recentWorkspaces.filter(w => w.path !== workspacePath);
      localStorage.setItem('ag_web_recent_workspaces', JSON.stringify(webState.recentWorkspaces));
      return Promise.resolve({ success: true });
    },
    checkStatus: async (workspacePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.checkStatus(workspacePath);
      return Promise.resolve({ success: true, status: 'active' });
    },
    scanFiles: async (workspacePath: string, ignorePatterns?: string[]) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.workspace.scanFiles(workspacePath, ignorePatterns);
      
      // Web mock scan
      const mockData = webState.mockFiles[workspacePath] || webState.mockFiles['/mock/workspace/NorthCore'];
      return Promise.resolve({ success: true, files: mockData });
    }
  },

  // Notification APIs
  notification: {
    show: async (options: { title: string; body: string; silent?: boolean }) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.notification.show(options);
      
      if (!webState.settings.enableNotifications) return { success: false, error: 'Notifications disabled' };
      
      console.log(`Notification: [${options.title}] ${options.body}`);
      // Fallback to browser notification if allowed, or standard alert/toast representation
      if (Notification.permission === 'granted') {
        new Notification(options.title, { body: options.body });
      }
      return Promise.resolve({ success: true });
    },
    taskCompleted: async (taskName: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.notification.taskCompleted(taskName);
      if (!webState.settings.notifyOnTaskCompleted) return { success: false };
      
      console.log(`Notification: Task Completed - ${taskName}`);
      if (Notification.permission === 'granted') {
        new Notification('任务完成', { body: taskName });
      }
      return Promise.resolve({ success: true });
    },
    artifactCreated: async (artifactName: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.notification.artifactCreated(artifactName);
      if (!webState.settings.notifyOnArtifactCreated) return { success: false };
      
      console.log(`Notification: Artifact Created - ${artifactName}`);
      if (Notification.permission === 'granted') {
        new Notification('Artifact 生成完成', { body: artifactName });
      }
      return Promise.resolve({ success: true });
    },
    artifactApplied: async (filePath: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.notification.artifactApplied(filePath);
      
      console.log(`Notification: Artifact Applied - ${filePath}`);
      if (Notification.permission === 'granted') {
        new Notification('已应用到本地', { body: filePath });
      }
      return Promise.resolve({ success: true });
    },
    checkSupport: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.notification.checkSupport();
      return Promise.resolve({ supported: 'Notification' in window });
    }
  },

  // Agent Process APIs
  agentProcess: {
    list: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.agentProcess.list();
      return Promise.resolve({ success: true, agents: webState.agentProcesses });
    },
    start: async (agentId: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.agentProcess.start(agentId);
      
      const agent = webState.agentProcesses.find(a => a.id === agentId);
      if (!agent) return Promise.resolve({ success: false, error: 'Agent not found' });
      
      agent.status = 'starting';
      agent.logs.push(`[${new Date().toISOString()}] Agent starting (Web Mock)...`);
      
      setTimeout(() => {
        agent.status = 'running';
        agent.pid = Math.floor(Math.random() * 1000) + 100;
        agent.logs.push(`[${new Date().toISOString()}] Agent started successfully. PID: ${agent.pid}`);
      }, 1500);
      
      return Promise.resolve({ success: true, agent });
    },
    stop: async (agentId: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.agentProcess.stop(agentId);
      
      const agent = webState.agentProcesses.find(a => a.id === agentId);
      if (!agent) return Promise.resolve({ success: false, error: 'Agent not found' });
      
      agent.status = 'stopping';
      agent.logs.push(`[${new Date().toISOString()}] Agent stopping (Web Mock)...`);
      
      setTimeout(() => {
        agent.status = 'stopped';
        agent.pid = null;
        agent.logs.push(`[${new Date().toISOString()}] Agent stopped successfully.`);
      }, 1000);
      
      return Promise.resolve({ success: true, agent });
    },
    restart: async (agentId: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.agentProcess.restart(agentId);
      
      const agent = webState.agentProcesses.find(a => a.id === agentId);
      if (!agent) return Promise.resolve({ success: false, error: 'Agent not found' });
      
      agent.status = 'stopping';
      agent.logs.push(`[${new Date().toISOString()}] Agent restarting (Web Mock)...`);
      
      setTimeout(() => {
        agent.status = 'starting';
        setTimeout(() => {
          agent.status = 'running';
          agent.pid = Math.floor(Math.random() * 1000) + 100;
          agent.logs.push(`[${new Date().toISOString()}] Agent restarted. PID: ${agent.pid}`);
        }, 1500);
      }, 1000);
      
      return Promise.resolve({ success: true, agent });
    },
    logs: async (agentId: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.agentProcess.logs(agentId);
      
      const agent = webState.agentProcesses.find(a => a.id === agentId);
      return Promise.resolve({ success: true, logs: agent ? agent.logs : [] });
    },
    status: async (agentId: string) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.agentProcess.status(agentId);
      
      const agent = webState.agentProcesses.find(a => a.id === agentId);
      return Promise.resolve({ success: true, status: agent ? agent.status : 'stopped' });
    }
  },

  // Settings APIs
  settings: {
    get: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.settings.get();
      return Promise.resolve({ success: true, settings: webState.settings });
    },
    set: async (newSettings: any) => {
      if (platform.isDesktop()) return window.northcoreDesktop!.settings.set(newSettings);
      
      webState.settings = { ...webState.settings, ...newSettings };
      localStorage.setItem('ag_web_settings', JSON.stringify(webState.settings));
      return Promise.resolve({ success: true });
    },
    reset: async () => {
      if (platform.isDesktop()) return window.northcoreDesktop!.settings.reset();
      
      webState.settings = {
        theme: 'light',
        allowRead: true,
        allowWrite: true,
        confirmBeforeWrite: true,
        defaultSaveDir: '',
        autoOverwrite: false,
        enableNotifications: true,
        notifyOnTaskCompleted: true,
        notifyOnArtifactCreated: true,
        notifyOnAgentError: true,
      };
      localStorage.removeItem('ag_web_settings');
      return Promise.resolve({ success: true });
    }
  },

  // Desktop Mock Testing Utilities
  desktopMock: {
    getMode: () => currentDesktopMode,
    setMode: (mode: any) => {
      (currentDesktopMode as any) = mode;
      localStorage.setItem('ag_desktop_mock_mode', mode);
      console.log(`[Platform] Desktop mock mode set to: ${mode}`);
    },
    isMockDesktopMode: () => (currentDesktopMode as any) === DESKTOP_MODES.MOCK_DESKTOP,
    getAvailableModes: () => Object.values(DESKTOP_MODES),
    getDesktopSystemInfo: () => {
      return {
        platformName: platform.getPlatformName(),
        isMockDesktop: (currentDesktopMode as any) === DESKTOP_MODES.MOCK_DESKTOP,
        mode: currentDesktopMode,
        mockWorkspacePath: '/mock/workspace/NorthCore',
        supportedFeatures: [
          'workspace_scan',
          'file_read',
          'file_write',
          'system_notification',
          'recent_workspaces',
          'workspace_boundary_enforcement'
        ]
      };
    }
  }
};
