# Regasist Desktop (Electron)

App de escritorio que conecta al servicio WebSocket local,
obtiene el hash del hardware y abre la vista de marcación remota
con el hash inyectado automaticamente.

Funciona en Windows, Mac y Linux sin depender de nada externo.

---

## Configuracion antes de compilar

Abre `main.js` y cambia estas 2 lineas:

```javascript
const APP_URL = 'http://tuservidor/marcar-remoto'; // tu URL real
const WS_URL  = 'ws://localhost:5556/';            // no cambiar
```

---

## Requisitos para compilar

- Node.js instalado (https://nodejs.org) version 18 o superior

---

## Instalar dependencias y probar

```bash
# Instalar dependencias
npm install

# Probar en tu maquina antes de compilar
npm start
```

---

## Compilar instalador

```bash
# Solo Windows (.exe instalador)
npm run build:win

# Solo Mac (.dmg)
npm run build:mac

# Solo Linux (.AppImage)
npm run build:linux

# Los tres a la vez
npm run build:all
```

Los instaladores quedan en la carpeta `dist/`

---

## Cambio en Angular

En `marcar-remoto.component.ts` reemplaza el metodo `solicitarMac()` por:

```typescript
solicitarMac() {
  this.SpinnerService.show();

  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'setHash') {
      if (event.data.hash && event.data.hash !== '') {
        this.mac_encontrada = event.data.hash;
        localStorage.setItem('sala_idre', "-1");
        this.SpinnerService.hide();
      } else {
        this.SpinnerService.hide();
        this.ocultar = 'ocultar';
        this.modalService.open(this.templatemodalerrormac, {
          ariaLabelledBy: 'modal-basic-title',
          centered: true
        });
      }
    }
  }, { once: true });

  // Si en 8 segundos no llega nada, mostrar error
  setTimeout(() => {
    if (!this.mac_encontrada || this.mac_encontrada === '') {
      this.SpinnerService.hide();
      this.ocultar = 'ocultar';
      this.modalService.open(this.templatemodalerrormac, {
        ariaLabelledBy: 'modal-basic-title',
        centered: true
      });
    }
  }, 8000);
}
```

---

## Flujo completo

```
1. Usuario abre Regasist Desktop (el .exe / .dmg / .AppImage)
2. Electron conecta a ws://localhost:5556 (sin restricciones de Chrome)
3. Manda { action: "hash" } y recibe { data: { hash: "ABC123" } }
4. Abre la vista marcar-remoto dentro de la ventana
5. Al cargar inyecta el hash via postMessage
6. Angular recibe el hash en mac_encontrada y funciona igual que antes
```

---

## Icono

Reemplaza los archivos en la carpeta `assets/`:
- `icon.png`  - 256x256 px (Linux y referencia)
- `icon.ico`  - (Windows)
- `icon.icns` - (Mac)

Si no los pones el build igual funciona pero sin icono personalizado.
