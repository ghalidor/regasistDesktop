const { app, BrowserWindow, dialog } = require('electron');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

// ============================================================
// CONFIGURACION
// ============================================================
const APP_URL = 'http://tuservidor/marcar-remoto';
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
    autoHideMenuBar: true,
    title: 'Regasist Remoto',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Cargar pantalla de carga primero
  mainWindow.loadURL('about:blank').then(() => {
    mostrarPantallaCarga();
    // Luego cargar la app real
    mainWindow.loadURL(APP_URL).catch(() => {
      mostrarPantallaError('No se pudo conectar al servidor.\nVerifique su conexión de red.');
    });
  });

  // Cuando carga correctamente inyectar el hash
  mainWindow.webContents.on('did-finish-load', () => {
    const urlActual = mainWindow.webContents.getURL();
    if (urlActual === 'about:blank') return;

    if (hashActual) {
      mainWindow.webContents.executeJavaScript(
        `window.postMessage({ action: 'setHash', hash: '${hashActual}' }, '*');`
      );
    }
  });

  // Si falla la carga mostrar pantalla de error
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL === 'about:blank') return;
    mostrarPantallaError(`No se pudo cargar la aplicación.\n${errorDescription}`);
  });

  // Prevenir navegacion a URLs diferentes a la app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const baseUrl = APP_URL.split('/marcar-remoto')[0];
    if (!url.startsWith(baseUrl) && url !== 'about:blank') {
      event.preventDefault();
      console.log('Navegacion bloqueada:', url);
    }
  });

  // Prevenir que abra ventanas nuevas
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Iniciar verificacion de cambios
  iniciarVerificacionCambios();
}

function mostrarPantallaCarga() {
  mainWindow.webContents.executeJavaScript(`
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.innerHTML = \`
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #1a1a2e;
        font-family: Arial, sans-serif;
        color: white;
        text-align: center;
      ">
        <div style="
          width: 60px;
          height: 60px;
          border: 5px solid #ffffff20;
          border-top-color: #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 24px;
        "></div>
        <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Cargando Regasist</h2>
        <p style="margin: 0; color: #aaaaaa; font-size: 14px;">Conectando al servidor...</p>
        <style>
          @keyframes spin { to { transform: rotate(360deg); } }
          * { box-sizing: border-box; }
        </style>
      </div>
    \`;
  `).catch(() => {});
}

function mostrarPantallaError(mensaje) {
  mainWindow.webContents.executeJavaScript(`
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.innerHTML = \`
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #1a1a2e;
        font-family: Arial, sans-serif;
        color: white;
        text-align: center;
        padding: 40px;
      ">
        <div style="
          width: 70px;
          height: 70px;
          background: #e74c3c20;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          font-size: 32px;
        ">⚠️</div>
        <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #e74c3c;">Error de Conexión</h2>
        <p style="margin: 0 0 32px 0; color: #aaaaaa; font-size: 14px; white-space: pre-line;">${mensaje}</p>
        <button onclick="location.reload()" style="
          background: #3498db;
          color: white;
          border: none;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">Reintentar</button>
        <style>
          * { box-sizing: border-box; }
          button:hover { background: #2980b9 !important; }
        </style>
      </div>
    \`;
  `).catch(() => {});
}

function obtenerIndexHtml() {
  return new Promise((resolve) => {
    const baseUrl = APP_URL.split('/marcar-remoto')[0];
    const checkUrl = baseUrl + '/index.html';

    http.get(checkUrl, (res) => {
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
  // Guardar version inicial
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

async function obtenerHashAsync() {
  return new Promise((resolve) => {
    console.log('Conectando al servicio WebSocket...');
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      console.log('Timeout: no respondio el servicio');
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
