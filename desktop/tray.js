const { Tray, Menu, app, BrowserWindow, nativeImage } = require('electron')
const path = require('path')

let appTray = null

function createTray(mainWindow) {
  const iconPath = path.join(__dirname, 'assets', 'icon.png')
  let trayIcon
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath)
  } catch (e) {
    trayIcon = nativeImage.createEmpty()
  }
  
  appTray = new Tray(trayIcon)
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 AgentHub',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '最近工作区',
      submenu: [
        {
          label: '暂无最近工作区',
          enabled: false
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: '设置',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])
  
  appTray.setToolTip('AgentHub')
  appTray.setContextMenu(contextMenu)
  
  appTray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  
  return appTray
}

function updateTrayMenu(workspaces = []) {
  if (!appTray) return
  
  const mainWindow = BrowserWindow.getAllWindows()[0]
  
  const workspaceSubmenu = workspaces.length > 0 
    ? workspaces.map(w => ({
        label: w.name || w.path,
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      }))
    : [{ label: '暂无最近工作区', enabled: false }]
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 AgentHub',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '最近工作区',
      submenu: workspaceSubmenu
    },
    {
      type: 'separator'
    },
    {
      label: '设置',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])
  
  appTray.setContextMenu(contextMenu)
}

module.exports = { createTray, updateTrayMenu }
