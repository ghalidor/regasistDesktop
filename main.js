const { app, BrowserWindow, dialog } = require('electron');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURACION — se lee desde config.json junto al ejecutable
// Si no existe config.json usa estos valores por defecto
// ============================================================
const DEFAULT_CONFIG = {
  APP_URL: 'http://localhost:4200/#/remoto',
  WS_URL:  'ws://localhost:5556/'
};

function cargarConfig() {
  try {
    // Buscar config.json junto al ejecutable instalado
    const configPath = path.join(path.dirname(app.getPath('exe')), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      console.log('Config cargada desde:', configPath);
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (err) {
    console.error('Error leyendo config.json, usando valores por defecto:', err.message);
  }
  console.log('Usando configuracion por defecto');
  return DEFAULT_CONFIG;
}

const config = cargarConfig();
const APP_URL = config.APP_URL;
const WS_URL  = config.WS_URL;
const CHECK_INTERVAL = 5 * 60 * 1000;
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
    minHeight: 600,
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
  const baseUrl = APP_URL.split('/#/')[0];
  return new Promise((resolve) => {
    http.get(baseUrl + '/index.html', (res) => {
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
    console.log('Conectando al servicio WebSocket:', WS_URL);
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