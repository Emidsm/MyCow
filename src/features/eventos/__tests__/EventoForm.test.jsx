import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { AnimalForm } from '../../animales/AnimalForm.jsx';
import { AnimalesList } from '../../animales/AnimalesList.jsx';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('AnimalForm — eventos terminales', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('animal activo: ofrece "Registrar muerte" y "Registrar venta"', async () => {
    await db.animales.put({
      client_id: 'a1', arete_local: '1', categoria: 'vaca', estado_vida: 'activo',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="a1" onClose={() => {}} />);

    expect(await screen.findByText('Registrar muerte')).toBeInTheDocument();
    expect(screen.getByText('Registrar venta')).toBeInTheDocument();
    expect(screen.getByText('Mover a potrero')).toBeInTheDocument();
  });

  // ── 4. Sin acciones terminales de nuevo ─────────────────────────────────
  it('animal muerto: no ofrece mover/vender/morir de nuevo, y muestra el detalle de la defunción', async () => {
    await db.animales.put({
      client_id: 'a2', arete_local: '2', categoria: 'vaca', estado_vida: 'muerto',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.defunciones.put({
      client_id: 'd1', animal_id: 'a2', fecha_muerte: '2026-06-15', causa: 'vejez',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="a2" onClose={() => {}} />);

    await screen.findByText(/marcado como/);
    expect(screen.queryByText('Registrar muerte')).not.toBeInTheDocument();
    expect(screen.queryByText('Registrar venta')).not.toBeInTheDocument();
    expect(screen.queryByText('Mover a potrero')).not.toBeInTheDocument();

    expect(screen.getByText('2026-06-15')).toBeInTheDocument();
    expect(screen.getByText('vejez')).toBeInTheDocument();
  });

  it('animal vendido: no ofrece acciones terminales, y muestra el detalle de la venta', async () => {
    await db.animales.put({
      client_id: 'a3', arete_local: '3', categoria: 'novillo', estado_vida: 'vendido',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.ventas.put({
      client_id: 'v1', animal_id: 'a3', fecha_venta: '2026-06-20', comprador: 'Rancho Vecino',
      precio: 15000, moneda: 'MXN', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="a3" onClose={() => {}} />);

    await screen.findByText(/marcado como/);
    expect(screen.queryByText('Registrar muerte')).not.toBeInTheDocument();
    expect(screen.queryByText('Registrar venta')).not.toBeInTheDocument();
    expect(screen.queryByText('Mover a potrero')).not.toBeInTheDocument();

    expect(screen.getByText('Rancho Vecino')).toBeInTheDocument();
    expect(screen.getByText('15000 MXN')).toBeInTheDocument();
  });

  it('registrar muerte desde el detalle: encola el insert, espeja estado_vida y actualiza la UI sola', async () => {
    await db.animales.put({
      client_id: 'a4', arete_local: '4', categoria: 'vaca', estado_vida: 'activo',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="a4" onClose={() => {}} />);

    fireEvent.click(await screen.findByText('Registrar muerte'));
    const dialog = within(document.querySelector('.evento-form'));
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () => {
      expect((await db.animales.get('a4')).estado_vida).toBe('muerto');
    });
    expect(await screen.findByText(/marcado como/)).toBeInTheDocument();
    expect(screen.queryByText('Mover a potrero')).not.toBeInTheDocument();
  });

  it('bloquea una segunda defunción con mensaje claro', async () => {
    await db.animales.put({
      client_id: 'a5', arete_local: '5', categoria: 'vaca', estado_vida: 'activo',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.defunciones.put({
      client_id: 'd5', animal_id: 'a5', fecha_muerte: '2026-05-01',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    // Fuerza un estado inconsistente (activo con defunción ya registrada) para
    // ejercer el CHECK del cliente aun si el espejo de estado ya lo ocultaría.
    render(<AnimalForm db={db} clientId="a5" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('Registrar muerte'));
    const dialog = within(document.querySelector('.evento-form'));
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Este animal ya tiene una defunción registrada.')).toBeInTheDocument();
    expect(await db.defunciones.where('animal_id').equals('a5').count()).toBe(1);
  });
});

describe('AnimalesList — eventos terminales', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  // ── 5. Evento terminal NO es softDelete ─────────────────────────────────
  it('un animal muerto (no borrado) sigue visible en la lista con su badge de estado', async () => {
    await db.animales.put({
      client_id: 'm1', arete_local: '50', categoria: 'vaca', estado_vida: 'muerto',
      created_at: '2026-01-01', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalesList db={db} />);

    expect(await screen.findByText('Arete 50')).toBeInTheDocument();
    const row = screen.getByText('Arete 50').closest('li');
    expect(row).toHaveTextContent('muerto');
  });
});
