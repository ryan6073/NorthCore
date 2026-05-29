const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const settingsPath = path.join(os.homedir(), '.agenthub-settings.json')

const defaultSettings = {
  general: {
    theme: 'system',
    language: 'zh-CN',
    launchOnStartup: false
  },
  notifications: {
    enabled: true,
    taskCompleted: true,
    artifactCreated: true,
    artifactApplied: true,
    agentError: true
  },
  files: {
    allowReadLocalFiles: true,
    allowWriteLocalFiles: true,
    confirmBeforeWrite: true,
    defaultSaveDirectory: '',
    allowOverwriteFiles: false
  },
  agentProcess: {
    defaultCommand: '',
    workingDirectory: '',
    defaultPort: 8000,
    launchOnStartup: false,
    logsPath: ''
  },
  api: {
    baseUrl: 'http://localhost:3000',
    apiKey: ''
  }
}

let currentSettings = { ...defaultSettings }

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      const parsed = JSON.parse(data)
      currentSettings = { ...defaultSettings, ...parsed }
    }
  } catch (error) {
    console.error('Load settings error:', error)
    currentSettings = { ...defaultSettings }
  }
}

function saveSettings() {
  try {
    const data = JSON.stringify(currentSettings, null, 2)
    fs.writeFileSync(settingsPath, data, 'utf-8')
  } catch (error) {
    console.error('Save settings error:', error)
  }
}

function registerSettingsHandlers() {
  loadSettings()

  ipcMain.handle('settings:get', async () => {
    try {
      return { success: true, settings: currentSettings }
    } catch (error) {
      console.error('Get settings error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('settings:set', async (event, newSettings) => {
    try {
      currentSettings = { ...currentSettings, ...newSettings }
      saveSettings()
      return { success: true, settings: currentSettings }
    } catch (error) {
      console.error('Set settings error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('settings:reset', async () => {
    try {
      currentSettings = { ...defaultSettings }
      saveSettings()
      return { success: true, settings: currentSettings }
    } catch (error) {
      console.error('Reset settings error:', error)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { registerSettingsHandlers }
