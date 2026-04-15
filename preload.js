// preload.js
// Este archivo corre en el contexto del navegador pero con acceso limitado
// Por seguridad no exponemos nada adicional, solo dejamos que postMessage funcione normal
window.addEventListener('DOMContentLoaded', () => {
  console.log('Regasist Desktop cargado');
});
