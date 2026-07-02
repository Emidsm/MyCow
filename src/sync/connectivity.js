/**
 * Detección de conectividad, SIN React.
 *
 * Expone un emitter minimalista (subscribe/online) para que el 2B (React) se
 * suscriba con un hook. Aquí NO hay dependencias de UI.
 *
 * Estrategia:
 *   - navigator.onLine + eventos 'online'/'offline' como señal barata.
 *   - Ping ligero OPCIONAL (pingFn) para detectar el caso "conectado al wifi
 *     pero sin internet real" (navigator.onLine=true pero no hay salida). El
 *     ping se inyecta para no acoplar este módulo a Supabase ni a fetch.
 *
 * Guardas de entorno: en Node/tests no existen window/navigator; el módulo
 * degrada a "online=true" y no registra listeners.
 */

const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
const hasNavigator = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean';

export function createConnectivity({ pingFn = null } = {}) {
  const listeners = new Set();
  let online = hasNavigator ? navigator.onLine : true;

  function emit() {
    for (const fn of listeners) {
      try { fn(online); } catch { /* un listener roto no rompe a los demás */ }
    }
  }

  function set(next) {
    if (next !== online) {
      online = next;
      emit();
    }
  }

  const onOnline = () => set(true);
  const onOffline = () => set(false);

  if (hasWindow) {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  return {
    /** Estado actual conocido. */
    get online() { return online; },

    /**
     * Suscribe un listener. Se le llama de inmediato con el estado actual y
     * devuelve una función para desuscribir.
     */
    subscribe(fn) {
      listeners.add(fn);
      fn(online);
      return () => listeners.delete(fn);
    },

    /**
     * Verificación activa opcional: ejecuta pingFn() y ajusta el estado según
     * éxito/fallo. Detecta "wifi sin internet". No-op si no se inyectó pingFn.
     */
    async check() {
      if (!pingFn) return online;
      try {
        await pingFn();
        set(true);
      } catch {
        set(false);
      }
      return online;
    },

    /** Limpia listeners del DOM. Llamar al desmontar (2B). */
    destroy() {
      if (hasWindow) {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
      listeners.clear();
    },
  };
}
