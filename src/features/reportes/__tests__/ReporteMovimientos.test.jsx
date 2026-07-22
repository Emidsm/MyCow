import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { ReporteMovimientos } from '../ReporteMovimientos.jsx';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ReporteMovimientos', () => {
  let db;
  beforeEach(async () => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('muestra estado vacío cuando no hay movimientos', async () => {
    renderWithRouter(<ReporteMovimientos db={db} />);
    expect(await screen.findByText(/No hay movimientos/)).toBeInTheDocument();
  });

  it('renderiza tabla agrupada con conteo de animales', async () => {
    await db.potreros.bulkAdd([
      { client_id: 'p1', id: 'p1', nombre: 'A', updated_at: '2025-01-01', deleted_at: null },
      { client_id: 'p2', id: 'p2', nombre: 'B', updated_at: '2025-01-01', deleted_at: null },
    ]);
    await db.animales.bulkAdd([
      { client_id: 'a1', id: 'a1', arete_local: '5', categoria: 'vaca', sexo: 'hembra', estado_vida: 'activo', created_at: '2025-01-01', deleted_at: null },
    ]);
    await db.movimientos.bulkAdd([
      { client_id: 'm1', id: 'm1', animal_id: 'a1', potrero_origen_id: 'p1', potrero_destino_id: 'p2', fecha: '2025-06-15', created_at: '2025-06-15', deleted_at: null },
    ]);

    renderWithRouter(<ReporteMovimientos db={db} />);
    const rows = await screen.findAllByRole('row');
    expect(rows.length).toBe(2);
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('B').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTitle('Ver aretes')).toBeInTheDocument();
  });

  it('muestra aretes al expandir grupo', async () => {
    await db.potreros.bulkAdd([
      { client_id: 'p1', id: 'p1', nombre: 'A', updated_at: '2025-01-01', deleted_at: null },
      { client_id: 'p2', id: 'p2', nombre: 'B', updated_at: '2025-01-01', deleted_at: null },
    ]);
    await db.animales.bulkAdd([
      { client_id: 'a1', id: 'a1', arete_local: '10', categoria: 'vaca', sexo: 'hembra', estado_vida: 'activo', created_at: '2025-01-01', deleted_at: null },
      { client_id: 'a2', id: 'a2', arete_local: '20', categoria: 'toro', sexo: 'macho', estado_vida: 'activo', created_at: '2025-01-01', deleted_at: null },
    ]);
    await db.movimientos.bulkAdd([
      { client_id: 'm1', id: 'm1', animal_id: 'a1', potrero_origen_id: 'p1', potrero_destino_id: 'p2', fecha: '2025-06-15', created_at: '2025-06-15T10:00', deleted_at: null },
      { client_id: 'm2', id: 'm2', animal_id: 'a2', potrero_origen_id: 'p1', potrero_destino_id: 'p2', fecha: '2025-06-15', created_at: '2025-06-15T10:01', deleted_at: null },
    ]);

    renderWithRouter(<ReporteMovimientos db={db} />);
    const toggle = await screen.findByTitle('Ver aretes');
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();
  });

  it('filtros de fecha filtran por rango', async () => {
    await db.potreros.bulkAdd([
      { client_id: 'p1', id: 'p1', nombre: 'A', updated_at: '2025-01-01', deleted_at: null },
      { client_id: 'p2', id: 'p2', nombre: 'B', updated_at: '2025-01-01', deleted_at: null },
    ]);
    await db.animales.bulkAdd([
      { client_id: 'a1', id: 'a1', arete_local: '1', categoria: 'vaca', sexo: 'hembra', estado_vida: 'activo', created_at: '2025-01-01', deleted_at: null },
    ]);
    await db.movimientos.bulkAdd([
      { client_id: 'm1', id: 'm1', animal_id: 'a1', potrero_origen_id: 'p1', potrero_destino_id: 'p2', fecha: '2025-01-01', created_at: '2025-01-01', deleted_at: null },
      { client_id: 'm2', id: 'm2', animal_id: 'a1', potrero_origen_id: 'p1', potrero_destino_id: 'p2', fecha: '2025-06-15', created_at: '2025-06-15', deleted_at: null },
    ]);

    renderWithRouter(<ReporteMovimientos db={db} />);
    await screen.findByText('15/06/2025');
    const rowsAll = screen.getAllByRole('row');
    expect(rowsAll.length).toBe(3);

    const desde = screen.getByLabelText('Desde');
    fireEvent.change(desde, { target: { value: '2025-06-01' } });

    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(2);
    expect(screen.getByText('15/06/2025')).toBeInTheDocument();
    expect(screen.queryByText('01/01/2025')).not.toBeInTheDocument();
  });
});
