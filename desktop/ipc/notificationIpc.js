const { ipcMain, Notification, app, BrowserWindow } = require('electron')

/** 获取主窗口（无论是否聚焦/最小化），唤起并聚焦 */
function activateMainWindow() {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const mainWin = windows[0]
    if (mainWin.isMinimized()) mainWin.restore()
    mainWin.show()
    mainWin.focus()
  }
}

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

      notification.on('click', () => {
        // 先唤起窗口（无论最小化/后台状态），再发送 IPC
        activateMainWindow()
        // 将 conversationId 传回 renderer，用于点击通知后跳转到对应会话
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          windows[0].webContents.send('notification:clicked', {
            callbackId: options.callbackId,
            conversationId: options.conversationId || null
          })
        }
      })

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
