const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('northcoreDesktop', {
  isDesktop: true,
  
  platform: process.platform,
  
  getVersion: () => ipcRenderer.invoke('system:getVersion'),
  
  getNodeVersion: () => ipcRenderer.invoke('system:getNodeVersion'),
  
  getArch: () => ipcRenderer.invoke('system:getArch'),
  
  getPlatformName: () => ipcRenderer.invoke('system:getPlatformName'),
  
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
    selectFile: (filters) => ipcRenderer.invoke('dialog:select-file', filters)
  },
  
  file: {
    readText: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
    writeText: (filePath, content) => ipcRenderer.invoke('file:write-text', filePath, content),
    openPath: (filePath) => ipcRenderer.invoke('file:open-path', filePath),
    revealInFolder: (filePath) => ipcRenderer.invoke('file:reveal-in-folder', filePath)
  },
  
  workspace: {
    getCurrent: () => ipcRenderer.invoke('workspace:get-current'),
    setCurrent: (workspacePath) => ipcRenderer.invoke('workspace:set-current', workspacePath),
    clearCurrent: () => ipcRenderer.invoke('workspace:clear-current'),
    getRecent: () => ipcRenderer.invoke('workspace:get-recent'),
    removeRecent: (workspacePath) => ipcRenderer.invoke('workspace:remove-recent', workspacePath),
    checkStatus: (workspacePath) => ipcRenderer.invoke('workspace:check-status', workspacePath),
    scanFiles: (workspacePath, ignorePatterns) => ipcRenderer.invoke('workspace:scan-files', workspacePath, ignorePatterns)
  },
  
  notification: {
    show: (options) => ipcRenderer.invoke('notification:show', options),
    taskCompleted: (taskName) => ipcRenderer.invoke('notification:task-completed', taskName),
    artifactCreated: (artifactName) => ipcRenderer.invoke('notification:artifact-created', artifactName),
    artifactApplied: (filePath) => ipcRenderer.invoke('notification:artifact-applied', filePath),
    checkSupport: () => ipcRenderer.invoke('notification:check-support'),
    onNotificationClicked: (callback) => {
      ipcRenderer.on('notification:clicked', (event, callbackId) => callback(callbackId))
    }
  },
  
  agentProcess: {
    list: () => ipcRenderer.invoke('agent-process:list'),
    start: (agentId) => ipcRenderer.invoke('agent-process:start', agentId),
    stop: (agentId) => ipcRenderer.invoke('agent-process:stop', agentId),
    restart: (agentId) => ipcRenderer.invoke('agent-process:restart', agentId),
    logs: (agentId) => ipcRenderer.invoke('agent-process:logs', agentId),
    status: (agentId) => ipcRenderer.invoke('agent-process:status', agentId)
  },
  
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (newSettings) => ipcRenderer.invoke('settings:set', newSettings),
    reset: () => ipcRenderer.invoke('settings:reset')
  }
})
