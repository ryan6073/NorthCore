const { ipcMain } = require('electron')
const os = require('os')

function registerSystemHandlers() {
  ipcMain.handle('system:getPlatform', () => {
    return process.platform
  })

  ipcMain.handle('system:getVersion', () => {
    return process.versions.electron
  })

  ipcMain.handle('system:getNodeVersion', () => {
    return process.version
  })

  ipcMain.handle('system:getArch', () => {
    return os.arch()
  })
}

module.exports = { registerSystemHandlers }
