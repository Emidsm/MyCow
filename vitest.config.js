import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // jsdom por defecto (hooks/componentes React); los tests de src/sync
      // fuerzan 'node' vía environmentMatchGlobs, tal como corrían antes.
      environment: 'jsdom',
      environmentMatchGlobs: [['src/sync/**', 'node']],
      // fake-indexeddb/auto es global (Dexie lo necesita en node Y en jsdom,
      // que tampoco trae IndexedDB); setupTests añade los matchers de
      // testing-library sólo para los tests de componentes.
      setupFiles: ['./src/sync/__tests__/setup.js', './src/test/setupTests.js'],
      include: ['src/**/*.test.{js,jsx}'],
      // Valores dummy SÓLO para que supabaseClient.js no aborte por
      // fail-fast al importarse en tests de componentes que montan
      // AuthProvider/SyncProvider reales (p.ej. src/__tests__/App.test.jsx).
      // Esos tests inyectan un `supabase` mock por props — nunca se hace
      // red real con estos valores. Los tests de src/sync siguen sin
      // importar supabaseClient.js en absoluto (ver nota en sync/index.js).
      env: {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
        VITE_APP_NAME: 'MyCow (test)',
        VITE_APP_TAGLINE: 'test',
      },
    },
  })
);
