const { ipcMain, Notification, app, BrowserWindow } = require('electron')

function registerNotificationHandlers() {
  ipcMain.handle('notification:show', async (event, options) => {
    try {
      if (!Notification.isSupported()) {
        return { success: false, error: 'System notifications not supported' }
      }

      const notification = new Notification({
        title: options.title || 'AgentHub',
        body: options.body || '',
        icon: undefined,
        silent: options.silent || false
      })

      if (options.onClick) {
        notification.on('click', () => {
          const focusedWindow = BrowserWindow.getFocusedWindow()
          if (focusedWindow) {
            focusedWindow.show()
            focusedWindow.focus()
          }
          if (options.callbackId) {
            event.sender.send('notification:clicked', options.callbackId)
          }
        })
      }

      notification.show()
      return { success: true }
    } catch (error) {
      console.error('Show notification error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('notification:task-completed', async (event, taskName) => {
    try {
      if (!Notification.isSupported()) {
        return { success: false }
      }

      const notification = new Notification({
        title: '任务完成',
        body: taskName || '任务已完成，您可以查看结果'
      })

      notification.on('click', () => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          windows[0].show()
          windows[0].focus()
        }
      })

      notification.show()
      return { success: true }
    } catch (error) {
      console.error('Task completed notification error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('notification:artifact-created', async (event, artifactName) => {
    try {
      if (!Notification.isSupported()) {
        return { success: false }
      }

      const notification = new Notification({
        title: 'Artifact 生成完成',
        body: artifactName || '新的产物已生成，您可以预览或应用到本地'
      })

      notification.on('click', () => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          windows[0].show()
          windows[0].focus()
        }
      })

      notification.show()
      return { success: true }
    } catch (error) {
      console.error('Artifact created notification error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('notification:artifact-applied', async (event, filePath) => {
    try {
      if (!Notification.isSupported()) {
        return { success: false }
      }

      const notification = new Notification({
        title: '已应用到本地',
        body: filePath || '文件已成功写入本地项目'
      })

      notification.on('click', () => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          windows[0].show()
          windows[0].focus()
        }
      })

      notification.show()
      return { success: true }
    } catch (error) {
      console.error('Artifact applied notification error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('notification:check-support', async () => {
    return {
      supported: Notification.isSupported()
    }
  })
}

module.exports = { registerNotificationHandlers }
