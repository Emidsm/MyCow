import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEngine } from '../../../sync/engine.js';
import { create } from '../../../sync/writes.js';
import { registrarDefuncion, registrarVenta } from '../useEventoMutations.js';
import { freshDb, dropDb, createMockSupabase } from '../../../sync/__tests__/helpers.js';

// defunciones/ventas comparten el mismo contrato de FK (animal_id) que
// movimientos/historial_categoria: una FK ya sincronizada (con id real) se
// traduce y empuja bien; una FK sin sincronizar es 'waiting_ref' (espera
// legítima), nunca 'failed' — ver FK_FIELDS en sync/engine.js.
describe('engine.push — defunciones/ventas con FK animal_id', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('defunción con animal_id ya sincronizado: push traduce la FK y envía bien', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    await db.animales.put({
      client_id: 'animal-cid', id: 'animal-real-id',
      categoria: 'vaca', estado_vida: 'activo',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const defuncion = await registrarDefuncion(db, {
      animal_id: 'animal-cid',
      fecha_muerte: '2026-07-01',
    });
    // Aislamos: sólo nos interesa la op de defunciones, no el update de animales.
    await db.outbox.where('entity').equals('animales').delete();

    const res = await engine.push();

    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(0);

    const [remoteRow] = supabase._tables.defunciones.filter((r) => r.client_id === defuncion.client_id);
    expect(remoteRow).toMatchObject({ animal_id: 'animal-real-id', fecha_muerte: '2026-07-01' });
  });

  it('defunción con animal_id sin sincronizar: waiting_ref, sin attempts++, converge cuando el animal llega', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 3, backoffBaseMs: 1000 } });

    // Animal creado offline, todavía SIN id real (no completó su pull).
    const animal = await create(db, 'animales', { arete_local: '9', categoria: 'vaca' });
    await db.outbox.where('client_id').equals(animal.client_id).delete();

    const defuncion = await registrarDefuncion(db, {
      animal_id: animal.client_id,
      fecha_muerte: '2026-07-01',
    });
    await db.outbox.where('entity').equals('animales').and((o) => o.client_id === animal.client_id).delete();

    const res = await engine.push();

    expect(res.pushed).toBe(0);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(1);

    const [op] = await db.outbox.where('client_id').equals(defuncion.client_id).toArray();
    expect(op.status).toBe('waiting_ref');
    expect(op.attempts).toBe(0);
    expect(supabase._tables.defunciones).toHaveLength(0);

    // El animal "sincroniza" (simula el efecto de un pull: id real local).
    await db.animales.update(animal.client_id, { id: 'animal-real-id-tardio' });

    const res2 = await engine.push();
    expect(res2.pushed).toBe(1);
    expect(res2.waitingRef).toBe(0);

    const [remoteRow] = supabase._tables.defunciones.filter((r) => r.client_id === defuncion.client_id);
    expect(remoteRow.animal_id).toBe('animal-real-id-tardio');
  });

  it('venta con animal_id ya sincronizado: push traduce la FK y envía bien', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    await db.animales.put({
      client_id: 'animal-cid2', id: 'animal-real-id2',
      categoria: 'novillo', estado_vida: 'activo',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const venta = await registrarVenta(db, { animal_id: 'animal-cid2', fecha_venta: '2026-07-01' });
    await db.outbox.where('entity').equals('animales').delete();

    const res = await engine.push();

    expect(res.pushed).toBe(1);
    expect(res.waitingRef).toBe(0);

    const [remoteRow] = supabase._tables.ventas.filter((r) => r.client_id === venta.client_id);
    expect(remoteRow).toMatchObject({ animal_id: 'animal-real-id2' });
  });
});
