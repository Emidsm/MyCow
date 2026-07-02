import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEngine } from '../engine.js';
import { freshDb, dropDb, createMockSupabase } from './helpers.js';

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-01T12:00:00.000Z'; // más reciente que T1

describe('engine.pull — reconciliación LWW y propagación de borrados', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await dropDb(db); });

  // ── ESCENARIO 4 ────────────────────────────────────────────────────────
  // pull() con LWW: remoto más nuevo pisa local; local más nuevo se conserva.
  it('remoto más nuevo gana; local más nuevo se conserva', async () => {
    // X: local viejo (T1), remoto nuevo (T2) → gana remoto.
    await db.potreros.put({ client_id: 'X', id: 'X', nombre: 'local-X', updated_at: T1, deleted_at: null });
    // Y: local nuevo (T2), remoto viejo (T1) → gana local.
    await db.potreros.put({ client_id: 'Y', id: 'Y', nombre: 'local-Y', updated_at: T2, deleted_at: null });

    const supabase = createMockSupabase({
      potreros: [
        { client_id: 'X', id: 'X', nombre: 'remoto-X', updated_at: T2, deleted_at: null },
        { client_id: 'Y', id: 'Y', nombre: 'remoto-Y', updated_at: T1, deleted_at: null },
      ],
    });
    const engine = createEngine({ db, supabase });

    await engine.pull();

    expect((await db.potreros.get('X')).nombre).toBe('remoto-X'); // remoto ganó
    expect((await db.potreros.get('Y')).nombre).toBe('local-Y');  // local conservado

    // Watermark avanzó al max(updated_at) visto del server (T2).
    expect(await engine.getMeta('last_pull_at:potreros')).toBe(T2);
  });

  // ── ESCENARIO 5 ────────────────────────────────────────────────────────
  // pull() propaga un soft-delete remoto (deleted_at) al local.
  it('propaga un soft-delete remoto al registro local', async () => {
    await db.potreros.put({ client_id: 'Z', id: 'Z', nombre: 'activo', updated_at: T1, deleted_at: null });

    const supabase = createMockSupabase({
      potreros: [
        { client_id: 'Z', id: 'Z', nombre: 'activo', updated_at: T2, deleted_at: T2 },
      ],
    });
    const engine = createEngine({ db, supabase });

    await engine.pull();

    const local = await db.potreros.get('Z');
    expect(local.deleted_at).toBe(T2); // borrado propagado, fila NO eliminada
    expect(await db.potreros.get('Z')).toBeTruthy();
  });

  it('normaliza client_id=id cuando el remoto trae client_id NULL', async () => {
    const supabase = createMockSupabase({
      potreros: [
        { client_id: null, id: 'legacy-1', nombre: 'seed-legacy', updated_at: T1, deleted_at: null },
      ],
    });
    const engine = createEngine({ db, supabase });

    await engine.pull();

    const local = await db.potreros.get('legacy-1'); // PK = id como fallback
    expect(local).toBeTruthy();
    expect(local.client_id).toBe('legacy-1');
  });
});
