import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { MovimientoForm } from '../MovimientoForm.jsx';
import { AnimalForm } from '../../animales/AnimalForm.jsx';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('MovimientoForm', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('precarga el origen autodetectado (potrero_actual_id del animal) como solo lectura', async () => {
    await db.potreros.put({ client_id: 'p-origen', nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.animales.put({
      client_id: 'a1', arete_local: '300', categoria: 'cria', potrero_actual_id: 'p-origen',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<MovimientoForm db={db} animalClientId="a1" onClose={() => {}} />);

    expect(await screen.findByDisplayValue('Morones')).toBeInTheDocument();
  });

  it('origen NULL (alta): muestra el estado sin potrero previo, no bloquea', async () => {
    await db.animales.put({
      client_id: 'a1', arete_local: '1', categoria: 'cria',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<MovimientoForm db={db} animalClientId="a1" onClose={() => {}} />);

    expect(await screen.findByDisplayValue('Alta (sin potrero previo)')).toBeInTheDocument();
  });

  it('bloquea guardar si destino == origen, con mensaje claro', async () => {
    await db.potreros.put({ client_id: 'p1', nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.animales.put({
      client_id: 'a1', arete_local: '300', categoria: 'cria', potrero_actual_id: 'p1',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<MovimientoForm db={db} animalClientId="a1" onClose={() => {}} />);

    await screen.findByDisplayValue('Morones');
    await screen.findByRole('option', { name: 'Morones' });
    fireEvent.change(screen.getByLabelText('Potrero destino *'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByText('Guardar'));

    expect(await screen.findByText('El potrero destino debe ser distinto del potrero de origen.')).toBeInTheDocument();
    expect(await db.movimientos.count()).toBe(0);
  });

  it('registra el movimiento, actualiza el espejo local y cierra', async () => {
    await db.potreros.bulkPut([
      { client_id: 'p1', nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
      { client_id: 'p2', nombre: 'El Jagüey', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
    ]);
    await db.animales.put({
      client_id: 'a1', arete_local: '300', categoria: 'cria', potrero_actual_id: 'p1',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const onClose = vi.fn();
    render(<MovimientoForm db={db} animalClientId="a1" onClose={onClose} />);

    await screen.findByDisplayValue('Morones');
    await screen.findByRole('option', { name: 'El Jagüey' });
    fireEvent.change(screen.getByLabelText('Potrero destino *'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const [mov] = await db.movimientos.toArray();
    expect(mov).toMatchObject({ animal_id: 'a1', potrero_origen_id: 'p1', potrero_destino_id: 'p2' });
    expect((await db.animales.get('a1')).potrero_actual_id).toBe('p2');
  });
});

describe('AnimalForm — integración con "Mover a potrero"', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('sólo en edición muestra la acción "Mover a potrero" y el historial', async () => {
    render(<AnimalForm db={db} onClose={() => {}} />); // alta
    expect(screen.queryByText('Mover a potrero')).not.toBeInTheDocument();
  });

  it('abre el form de movimiento desde el detalle del animal y refleja el cambio en el historial', async () => {
    await db.potreros.bulkPut([
      { client_id: 'p1', nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
      { client_id: 'p2', nombre: 'El Jagüey', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
    ]);
    await db.animales.put({
      client_id: 'a1', arete_local: '300', categoria: 'cria', potrero_actual_id: 'p1',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="a1" onClose={() => {}} />);

    await screen.findByText('Editar animal');
    expect(await screen.findByText('Sin movimientos registrados.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mover a potrero' }));
    await screen.findByDisplayValue('Morones');

    const movimientoDialog = within(document.querySelector('.movimiento-form'));
    await movimientoDialog.findByRole('option', { name: 'El Jagüey' });
    fireEvent.change(movimientoDialog.getByLabelText('Potrero destino *'), { target: { value: 'p2' } });
    fireEvent.click(movimientoDialog.getByText('Guardar'));

    await waitFor(() => expect(document.querySelector('.movimiento-form')).not.toBeInTheDocument());
    expect(await screen.findByText('Morones → El Jagüey')).toBeInTheDocument();
  });
});
