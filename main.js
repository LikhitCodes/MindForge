const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDB } = require('./core/db');
const { startServer, broadcast } = require('./core/server');
const { startWatcher } = require('./core/watcher');
const { startDjango, stopDjango } = require('./core/djangoHandler');

let mainWindow;

app.whenReady().then(async () => {
  // Initialize Supabase connection
  const dbReady = initDB();
  if (!dbReady) {
    dialog.showErrorBox(
      'MindForge — Database Error',
      'Could not connect to Supabase. Please check your SUPABASE_URL and SUPABASE_ANON_KEY in the .env file.'
    );
    app.quit();
    return;
  }

  // Start Express + WebSocket server
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox(
      'MindForge — Port Error',
      `Port 39871 is already in use. Please close the other app and restart.\n\n${err.message}`
    );
    app.quit();
    return;
  }

  // Start system watcher
  await startWatcher(broadcast);

  // Start Django backend
  try {
    await startDjango();
  } catch (err) {
    dialog.showErrorBox(
      'MindForge — Backend Error',
      `Could not start or connect to the Django server.\n\n${err.message}`
    );
    app.quit();
    return;
  }

  // Create main window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    frame: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev: load Vite dev server. Prod: load built files
  if (process.env.NODE_ENV === 'development') {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let lanIp = 'localhost';
    outer: for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.137')) {
          lanIp = iface.address;
          break outer;
        }
      }
    }
    // Fallback if only hotspot exists
    if (lanIp === 'localhost') {
       for (const name of Object.keys(interfaces)) {
         for (const iface of interfaces[name]) {
           if (iface.family === 'IPv4' && !iface.internal) lanIp = iface.address;
         }
       }
    }
    
    console.log(`[Electron] Loading UI from http://${lanIp}:5173`);
    mainWindow.loadURL(`http://${lanIp}:5173`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});

app.on('window-all-closed', () => {
  stopDjango();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopDjango();
});

app.on('activate', () => {
  if (mainWindow === null) {
    // Re-create window on macOS dock click
  }
});
