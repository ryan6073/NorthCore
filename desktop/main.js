const { app, BrowserWindow } = require('electron')
const path = require('path')

const { registerWindowHandlers } = require('./ipc/window')
const { registerSystemHandlers } = require('./ipc/system')
const { registerFileHandlers } = require('./ipc/fileIpc')
const { registerNotificationHandlers } = require('./ipc/notificationIpc')
const { registerAgentProcessHandlers } = require('./ipc/agentProcessIpc')
const { registerWorkspaceHandlers } = require('./ipc/workspaceIpc')
const { registerSettingsHandlers } = require('./ipc/settingsIpc')
const { createAppMenu } = require('./menu')

let mainWindow = null
let appTray = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    }
  })

  mainWindow.loadURL('https://test1.yeolde.fun')

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerAllHandlers() {
  registerWindowHandlers()
  registerSystemHandlers()
  registerFileHandlers()
  registerNotificationHandlers()
  registerAgentProcessHandlers()
  registerWorkspaceHandlers()
  registerSettingsHandlers()
}

app.whenReady().then(() => {
  registerAllHandlers()
  createWindow()
  createAppMenu()
  
  try {
    const { createTray } = require('./tray')
    if (mainWindow) {
      appTray = createTray(mainWindow)
    }
  } catch (e) {
    console.log('Tray creation skipped:', e.message)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('quit', () => {
  appTray = null
})
