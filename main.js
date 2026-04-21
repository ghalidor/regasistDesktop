const { app, BrowserWindow, dialog } = require('electron');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

// ============================================================
// CONFIGURACION
// ============================================================
const APP_URL = 'http://localhost:4200/#/remoto';
const WS_URL  = 'ws://localhost:5556/';
const CHECK_INTERVAL = 5 * 60 * 1000; // verificar cambios cada 5 minutos
// ============================================================

let mainWindow;
let currentIndexHtml = null;
let hashActual = '';

function crearVentana(hash) {
  hashActual = hash;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
	minWidth: 768,
    minHeight: 1024,
    autoHideMenuBar: true,
    title: 'Regasist Remoto',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Mostrar pantalla de carga
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  // Cuando cargue el loading, cargar la app real
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      mainWindow.loadURL(APP_URL);
    }, 500);
  });

  // Cuando cargue la app inyectar el hash
  mainWindow.webContents.on('did-finish-load', () => {
    const urlActual = mainWindow.webContents.getURL();
    if (urlActual.includes('loading.html')) return;

    if (hashActual) {
      mainWindow.webContents.executeJavaScript(
        `window.postMessage({ action: 'setHash', hash: '${hashActual}' }, '*');`
      );
    } else {
      mainWindow.webContents.executeJavaScript(
        `window.postMessage({ action: 'setHash', hash: '' }, '*');`
      );
    }
  });

  // Iniciar verificacion de cambios
  iniciarVerificacionCambios();
}

function obtenerIndexHtml() {
  return new Promise((resolve) => {
    http.get('http://localhost:4200/index.html', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', () => resolve(null));
  });
}

async function verificarCambios() {
  try {
    const nuevoIndexHtml = await obtenerIndexHtml();
    if (!nuevoIndexHtml) return false;
    if (currentIndexHtml === null) {
      currentIndexHtml = nuevoIndexHtml;
      return false;
    }
    if (nuevoIndexHtml !== currentIndexHtml) {
      currentIndexHtml = nuevoIndexHtml;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function iniciarVerificacionCambios() {
  obtenerIndexHtml().then(html => {
    currentIndexHtml = html;
  });

  setInterval(async () => {
    const hayCambios = await verificarCambios();
    if (hayCambios) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización disponible',
        message: 'Hay una nueva versión disponible.',
        detail: '¿Desea recargar la aplicación para ver los cambios?',
        buttons: ['Recargar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1
      });

      if (response === 0) {
        mainWindow.loadURL(APP_URL).then(() => {
          mainWindow.webContents.once('did-finish-load', () => {
            if (hashActual) {
              mainWindow.webContents.executeJavaScript(
                `window.postMessage({ action: 'setHash', hash: '${hashActual}' }, '*');`
              );
            }
          });
        });
      }
    }
  }, CHECK_INTERVAL);
}

function obtenerHash() {
  return new Promise((resolve) => {
    console.log('Conectando al servicio WebSocket...');
    const ws = new WebSocket(WS_URL);

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
  const hash = await obtenerHash();
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
