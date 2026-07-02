/**
 * Configuración del motor de sync.
 *
 * REGLA INNEGOCIABLE: CERO hardcoding. Todo valor operativo (nombre de la
 * base local, cadencia del auto-sync, reintentos y backoff) se lee de
 * `import.meta.env` (inyectado por Vite) con defaults sensatos y documentados
 * aquí y en `.env.example`.
 *
 * Los defaults existen para que la app funcione "out of the box" en dev/test,
 * pero producción DEBE fijar los valores en `.env`.
 */

// Lee una var de entorno; si viene vacía/ausente devuelve el fallback.
// `import.meta.env` está definido por Vite (app) y por Vitest (tests).
function readEnv(key, fallback) {
  const raw = import.meta.env?.[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  return raw;
}

function readIntEnv(key, fallback) {
  const value = Number(readEnv(key, fallback));
  // Si alguien pone un valor no numérico en .env, degradamos al default
  // en vez de propagar un NaN que rompería intervalos/backoff.
  return Number.isFinite(value) ? value : fallback;
}

// Nombre de la base IndexedDB local (Dexie).
export const SYNC_DB_NAME = readEnv('VITE_SYNC_DB_NAME', 'mycow_sync');

// Cada cuánto dispara el auto-sync el scheduler (ms). Default: 30 s.
export const SYNC_INTERVAL_MS = readIntEnv('VITE_SYNC_INTERVAL_MS', 30_000);

// Nº máximo de reintentos de una op del outbox antes de quedar como
// "dead-letter" (status='failed', ya no se reintenta sola). Default: 5.
export const SYNC_MAX_RETRIES = readIntEnv('VITE_SYNC_MAX_RETRIES', 5);

// Base del backoff exponencial entre reintentos (ms). El delay del intento
// n es `base * 2^n`. Default: 1 s → 2s, 4s, 8s, 16s, 32s...
export const SYNC_BACKOFF_BASE_MS = readIntEnv('VITE_SYNC_BACKOFF_BASE_MS', 1_000);

// Watermark inicial para el primer pull: el epoch, para traer TODO.
export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

// Objeto de config agrupado, útil para inyectar en el engine (DI/tests).
export const syncConfig = {
  dbName: SYNC_DB_NAME,
  intervalMs: SYNC_INTERVAL_MS,
  maxRetries: SYNC_MAX_RETRIES,
  backoffBaseMs: SYNC_BACKOFF_BASE_MS,
};
