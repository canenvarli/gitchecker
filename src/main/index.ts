import { app, BrowserWindow, shell, Menu } from 'electron'
import path from 'path'
import { registerIpcHandlers, refreshRepos } from './ipc/handlers'
import { startWatcher, restartWatcher } from './git/watcher'
import { scanAllRepos } from './git/scanner'
import { loadConfig } from './config/store'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    transparent: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
    show: false,
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  if (isDev) {
    // Vite dev server
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'
    win.loadURL(devServerUrl)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Open external links in the OS browser, not in the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  return win
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' as const }] : []),
        { type: 'separator' as const },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' as const },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

async function initializeApp(win: BrowserWindow): Promise<void> {
  const config = loadConfig()

  try {
    const repoPaths = await scanAllRepos(config.watchRoots, config.ignoredRepos)

    // Start file watcher
    startWatcher(repoPaths, win, async () => { await refreshRepos(win) })

    // Initial scan — send status to renderer once it's ready
    win.webContents.once('did-finish-load', async () => {
      try {
        await refreshRepos(win)
      } catch (err) {
        console.error('[main] Initial refresh failed:', err)
      }
    })
  } catch (err) {
    console.error('[main] initializeApp error:', err)
  }
}

app.whenReady().then(() => {
  buildAppMenu()

  mainWindow = createWindow()
  registerIpcHandlers(mainWindow)
  initializeApp(mainWindow)

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      registerIpcHandlers(mainWindow)
      initializeApp(mainWindow)
    } else if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, keep app running in dock even with no windows
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Clean up watcher
  const { stopWatcher } = require('./git/watcher') as typeof import('./git/watcher')
  stopWatcher()
})

// Security: prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    if (parsedUrl.origin !== 'http://localhost:5173' && !isDev) {
      event.preventDefault()
    }
  })
})

// Handle config changes that require watcher restart (exposed for IPC)
export function handleConfigUpdate(repoPaths: string[]): void {
  if (mainWindow) {
    restartWatcher(repoPaths, mainWindow, async () => { await refreshRepos(mainWindow!) })
  }
}
