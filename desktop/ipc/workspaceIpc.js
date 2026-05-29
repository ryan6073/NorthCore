const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const workspaceConfigPath = path.join(os.homedir(), '.agenthub-workspaces.json')
let currentWorkspace = null
let recentWorkspaces = []

function loadWorkspaces() {
  try {
    if (fs.existsSync(workspaceConfigPath)) {
      const data = fs.readFileSync(workspaceConfigPath, 'utf-8')
      const parsed = JSON.parse(data)
      recentWorkspaces = parsed.recentWorkspaces || []
      currentWorkspace = parsed.currentWorkspace || null
    }
  } catch (error) {
    console.error('Load workspaces error:', error)
  }
}

function saveWorkspaces() {
  try {
    const data = JSON.stringify({
      recentWorkspaces,
      currentWorkspace
    }, null, 2)
    fs.writeFileSync(workspaceConfigPath, data, 'utf-8')
  } catch (error) {
    console.error('Save workspaces error:', error)
  }
}

function checkWorkspaceStatus(workspacePath) {
  try {
    if (!workspacePath) {
      return { status: 'none' }
    }
    if (!fs.existsSync(workspacePath)) {
      return { status: 'unavailable' }
    }
    const stats = fs.statSync(workspacePath)
    if (!stats.isDirectory()) {
      return { status: 'unavailable' }
    }
    return { status: 'active', path: workspacePath }
  } catch (error) {
    console.error('Check workspace status error:', error)
    return { status: 'error', error: error.message }
  }
}

function registerWorkspaceHandlers() {
  loadWorkspaces()

  ipcMain.handle('workspace:get-current', async () => {
    try {
      if (!currentWorkspace) {
        return { success: true, workspace: null, status: 'none' }
      }
      const statusInfo = checkWorkspaceStatus(currentWorkspace.path)
      return { success: true, workspace: currentWorkspace, ...statusInfo }
    } catch (error) {
      console.error('Get current workspace error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:set-current', async (event, workspacePath) => {
    try {
      const statusInfo = checkWorkspaceStatus(workspacePath)
      if (statusInfo.status !== 'active') {
        return { success: false, error: 'Workspace is not accessible', status: statusInfo.status }
      }
      
      currentWorkspace = {
        path: workspacePath,
        name: path.basename(workspacePath),
        openedAt: new Date().toISOString()
      }
      
      const existingIndex = recentWorkspaces.findIndex(w => w.path === workspacePath)
      if (existingIndex !== -1) {
        recentWorkspaces.splice(existingIndex, 1)
      }
      recentWorkspaces.unshift(currentWorkspace)
      
      if (recentWorkspaces.length > 10) {
        recentWorkspaces = recentWorkspaces.slice(0, 10)
      }
      
      saveWorkspaces()
      return { success: true, workspace: currentWorkspace }
    } catch (error) {
      console.error('Set current workspace error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:clear-current', async () => {
    try {
      currentWorkspace = null
      saveWorkspaces()
      return { success: true }
    } catch (error) {
      console.error('Clear current workspace error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:get-recent', async () => {
    try {
      const workspacesWithStatus = recentWorkspaces.map(w => ({
        ...w,
        status: checkWorkspaceStatus(w.path).status
      }))
      return { success: true, workspaces: workspacesWithStatus }
    } catch (error) {
      console.error('Get recent workspaces error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:remove-recent', async (event, workspacePath) => {
    try {
      recentWorkspaces = recentWorkspaces.filter(w => w.path !== workspacePath)
      saveWorkspaces()
      return { success: true }
    } catch (error) {
      console.error('Remove recent workspace error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:check-status', async (event, workspacePath) => {
    try {
      const statusInfo = checkWorkspaceStatus(workspacePath)
      return { success: true, ...statusInfo }
    } catch (error) {
      console.error('Check workspace status error:', error)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { registerWorkspaceHandlers }
