import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { create } from '../writes.js';
import { createEngine } from '../engine.js';
import { freshDb, dropDb, createMockSupabase } from './helpers.js';

// ── ESCENARIO 7 ──────────────────────────────────────────────────────────
// sync() reentrante: dos llamadas concurrentes no corren dos ciclos.
describe('engine.sync — lock de reentrada', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await dropDb(db); });

  it('una segunda llamada concurrente no arranca otro ciclo', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase });

    await create(db, 'potreros', { nombre: 'Morones' });

    // Arrancamos el primero SIN await; el lock se fija de forma síncrona
    // antes del primer await, así que la segunda llamada lo ve activo.
    const p1 = engine.sync();
    const r2 = await engine.sync(); // debe salir inmediatamente
    const r1 = await p1;

    expect(r2.skipped).toBe(true);
    expect(r2.reason).toBe('already-running');
    expect(r1.skipped).toBe(false);

    // Sólo corrió UN ciclo → un único upsert (el de la única op del outbox).
    expect(supabase.upsertCalls).toBe(1);
    expect(await db.outbox.count()).toBe(0);

    // Tras terminar, el lock se liberó: un nuevo sync corre normalmente.
    expect(engine.isRunning()).toBe(false);
    const r3 = await engine.sync();
    expect(r3.skipped).toBe(false);
  });
});
