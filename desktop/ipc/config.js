const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const configPath = path.join(os.homedir(), '.northcore-desktop.json')

function registerConfigHandlers() {
  ipcMain.handle('config:readConfig', async () => {
    try {
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8')
        return JSON.parse(data)
      }
      return {
        theme: 'light',
        windowBounds: { width: 1200, height: 800 },
        lastOpenedAt: null
      }
    } catch (error) {
      console.error('Read config error:', error)
      return {
        theme: 'light',
        windowBounds: { width: 1200, height: 800 }
      }
    }
  })

  ipcMain.handle('config:writeConfig', async (event, configData) => {
    try {
      let existingConfig = {}
      if (fs.existsSync(configPath)) {
        const existingData = fs.readFileSync(configPath, 'utf-8')
        existingConfig = JSON.parse(existingData)
      }
      
      const mergedConfig = { ...existingConfig, ...configData, updatedAt: new Date().toISOString() }
      fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8')
      return { success: true, config: mergedConfig }
    } catch (error) {
      console.error('Write config error:', error)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { registerConfigHandlers }
