const { app, BrowserWindow } = require('electron');
const WebSocket = require('ws');
const path = require('path');

const APP_URL = 'http://localhost:4200/#/remoto';
const WS_URL  = 'ws://localhost:5556/';

let mainWindow;

function crearVentana(hash) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    title: 'Regasist Remoto',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on('did-finish-load', () => {
    if (hash) {
      mainWindow.webContents.executeJavaScript(
        `window.postMessage({ action: 'setHash', hash: '${hash}' }, '*');`
      );
    }
  });
}

async function obtenerHashAsync() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      ws.terminate();
      resolve('');
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'hash' }));
    });

    ws.on('message', (data) => {
      try {
        clearTimeout(timeout);
        const response = JSON.parse(data.toString());
        const hash = response.data.hash;
        ws.close();
        resolve(hash);
      } catch (error) {
        ws.close();
        resolve('');
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve('');
    });
  });
}

app.whenReady().then(async () => {
  const hash = await obtenerHashAsync();
  crearVentana(hash);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      crearVentana(hash);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
