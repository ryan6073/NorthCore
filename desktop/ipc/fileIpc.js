const { ipcMain, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  '.vite',
  'coverage'
]

function registerFileHandlers() {
  ipcMain.handle('dialog:select-directory', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    return { success: true, path: result.filePaths[0] }
  })

  ipcMain.handle('dialog:select-file', async (event, filters) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [
        { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    return { success: true, path: result.filePaths[0] }
  })

  ipcMain.handle('file:read-text', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      console.error('Read file error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('file:write-text', async (event, filePath, content) => {
    try {
      const dirPath = path.dirname(filePath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('Write file error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('file:open-path', async (event, filePath) => {
    try {
      await shell.openPath(filePath)
      return { success: true }
    } catch (error) {
      console.error('Open path error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('file:reveal-in-folder', async (event, filePath) => {
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      console.error('Reveal in folder error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:scan-files', async (event, workspacePath, ignorePatterns) => {
    try {
      const patterns = ignorePatterns || DEFAULT_IGNORE_PATTERNS
      const files = scanDirectory(workspacePath, '', patterns)
      return { success: true, files }
    } catch (error) {
      console.error('Scan files error:', error)
      return { success: false, error: error.message }
    }
  })
}

function scanDirectory(basePath, relativePath, ignorePatterns) {
  const fullPath = path.join(basePath, relativePath)
  const items = []
  
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    
    for (const entry of entries) {
      if (ignorePatterns.includes(entry.name)) {
        continue
      }
      
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name
      
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: entryRelativePath,
          type: 'directory',
          children: scanDirectory(basePath, entryRelativePath, ignorePatterns)
        })
      } else {
        const ext = path.extname(entry.name).toLowerCase()
        items.push({
          name: entry.name,
          path: entryRelativePath,
          type: 'file',
          extension: ext.slice(1)
        })
      }
    }
  } catch (error) {
    console.error('Scan directory error:', error)
  }
  
  return items
}

module.exports = { registerFileHandlers }
