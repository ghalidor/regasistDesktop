const { app, BrowserWindow } = require('electron');
const WebSocket = require('ws');
const path = require('path');

// ============================================================
// CONFIGURACION - Cambia estos valores segun tu entorno
// ============================================================
const APP_URL = 'http://localhost:4200/#/remoto';
const WS_URL  = 'ws://localhost:5556/';
// ============================================================

let mainWindow;

function crearVentana(hash) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,       // oculta la barra de menu
    title: 'Regasist Remoto',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Cargar la app Angular
  mainWindow.loadURL(APP_URL);

  // Cuando la pagina termine de cargar, inyectar el hash
  mainWindow.webContents.on('did-finish-load', () => {
    if (hash) {
      mainWindow.webContents.executeJavaScript(
        `window.postMessage({ action: 'setHash', hash: '${hash}' }, '*');`
      );
      console.log('Hash inyectado:', hash);
    } else {
      // Si no hay hash, igual cargar la pagina pero Angular mostrara el error
      mainWindow.webContents.executeJavaScript(
        `window.postMessage({ action: 'setHash', hash: '' }, '*');`
      );
      console.log('No se obtuvo hash del servicio');
    }
  });
}

function obtenerHash() {
  return new Promise((resolve) => {
    console.log('Conectando al servicio WebSocket...');

    const ws = new WebSocket(WS_URL);

    // Timeout de 10 segundos
    const timeout = setTimeout(() => {
      console.log('Timeout: no respondio el servicio');
      ws.terminate();
      resolve('');
    }, 10000);

    ws.on('open', () => {
      console.log('WebSocket conectado, solicitando hash...');
      ws.send(JSON.stringify({ action: 'hash' }));
    });

    ws.on('message', (data) => {
      try {
        clearTimeout(timeout);
        const response = JSON.parse(data.toString());
        const hash = response.data.hash;
        console.log('Hash recibido:', hash);
        ws.close();
        resolve(hash);
      } catch (error) {
        console.error('Error parseando respuesta:', error);
        ws.close();
        resolve('');
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('Error WebSocket:', error.message);
      resolve('');
    });
  });
}

app.whenReady().then(async () => {
  // 1. Obtener hash del servicio Windows
  const hash = await obtenerHash();

  // 2. Crear ventana con el hash obtenido
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
