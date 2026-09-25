// Crea, UNA SOLA VEZ, la cuenta de Roble que el servidor de Adapta11 usara
// para hablar con la base de datos (no es una cuenta de un estudiante: es la
// "cuenta de servicio" con la que el backend inicia sesion al arrancar).
//
// Como correrlo (en tu computador, NO en el sandbox de Claude):
//   npm install roble-client
//   node scripts/roble-crear-cuenta-servicio.mjs
//
// Copia el userId que imprime al final: lo vamos a necesitar despues.
// Luego, en la consola de Roble (Configuracion del Proyecto -> Roles),
// hay que asignarle a esta cuenta el rol "editor" (crea, lee, actualiza y
// borra en cualquier tabla) en vez del rol "user" por defecto, que solo
// puede crear y leer.

import { RobleApiClient } from 'roble-client';

const BASE_URL = process.env.ROBLE_BASE_URL || 'https://roble-api.test-openlab.uninorte.edu.co';
const CONTRACT_ID = process.env.ROBLE_CONTRACT_ID || 'adapta11_c0f86002c5';

// Cambia esta contrasena por una tuya antes de correr el script (o pasala
// por variable de entorno ROBLE_SERVICE_PASSWORD). No la subas a git.
const EMAIL = process.env.ROBLE_SERVICE_EMAIL || 'servicio@adapta11.local';
const PASSWORD = process.env.ROBLE_SERVICE_PASSWORD;

if (!PASSWORD) {
  console.error('Define ROBLE_SERVICE_PASSWORD antes de correr este script.');
  console.error('Ejemplo (PowerShell): $env:ROBLE_SERVICE_PASSWORD="unaClaveLarga!123"; node scripts/roble-crear-cuenta-servicio.mjs');
  process.exit(1);
}

const memoria = new Map();
const db = new RobleApiClient({
  baseUrl: BASE_URL,
  contractId: CONTRACT_ID,
  storage: {
    getItem: (k) => memoria.get(k) ?? null,
    setItem: (k, v) => memoria.set(k, v),
    removeItem: (k) => memoria.delete(k),
  },
});

try {
  await db.register({ email: EMAIL, password: PASSWORD, name: 'Adapta11 Servicio' });
  console.log('Cuenta registrada:', EMAIL);
} catch (e) {
  if (e.statusCode === 409 || /ya existe|already/i.test(e.message || '')) {
    console.log('La cuenta ya existia, sigo con el login.');
  } else {
    console.error('No se pudo registrar:', e.constructor?.name, e.statusCode, e.message);
    process.exit(1);
  }
}

const user = await db.login({ email: EMAIL, password: PASSWORD });
console.log('Login OK. userId =', user.userId, ' role =', user.role ?? 'null');
console.log('');
console.log('Ahora ve a la consola de Roble -> tu proyecto -> Configuracion del');
console.log('Proyecto -> Roles, y asignale a esta cuenta (o al rol "user", si va a');
console.log('ser la unica cuenta) el rol "editor" para que el servidor pueda crear,');
console.log('leer, actualizar y borrar en todas las tablas.');

db.realtime.close();
db.notificationsConnection.close();
