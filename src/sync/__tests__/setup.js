// Instala una implementación en memoria de IndexedDB en globalThis para que
// Dexie funcione en Node sin navegador. NO toca red real.
import 'fake-indexeddb/auto';
