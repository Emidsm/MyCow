import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { AnimalesList } from '../AnimalesList.jsx';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

// Réplica reducida de los 7 registros reales de supabase/seed.sql: incluye
// deliberadamente la vaca_1 casi vacía y los dos casing distintos de raza
// 'brangus'/'Brangus' que la UI NO debe normalizar.
async function seedAnimales(db) {
  await db.potreros.put({ client_id: 'a1', id: 'a1', nombre: 'El Jagüey', updated_at: '2025-01-01', deleted_at: null });

  const rows = [
    { client_id: 'b1', id: 'b1', arete_local: '1', categoria: 'vaca', sexo: 'hembra', estado_vida: 'activo', observaciones: 'tirado', created_at: '2025-01-01', deleted_at: null },
    { client_id: 'b2', id: 'b2', arete_local: '2', categoria: 'vaca', sexo: 'hembra', color: 'Puma', raza: 'quemada', estado_vida: 'activo', created_at: '2025-01-02', deleted_at: null },
    { client_id: 'b3', id: 'b3', arete_local: '3', arete_siniiga: '11814700', categoria: 'vaca', sexo: 'hembra', raza: 'brangus', estado_vida: 'activo', created_at: '2025-01-03', deleted_at: null },
    { client_id: 'b4', id: 'b4', arete_local: '4', arete_siniiga: '11814702', categoria: 'vaca', sexo: 'hembra', raza: 'Brangus', estado_vida: 'activo', created_at: '2025-01-04', deleted_at: null },
    { client_id: 'b5', id: 'b5', arete_local: '92', categoria: 'cria', sexo: 'macho', estado_vida: 'activo', created_at: '2025-01-05', deleted_at: null },
    { client_id: 'b6', id: 'b6', arete_local: '99', categoria: 'cria', sexo: 'hembra', estado_vida: 'activo', created_at: '2025-01-06', deleted_at: null },
    { client_id: 'b7', id: 'b7', arete_local: '300', categoria: 'cria', sexo: null, estado_vida: 'activo', potrero_actual_id: 'a1', created_at: '2025-01-07', deleted_at: null },
    // Borrado: debe quedar excluido (regla innegociable deleted_at IS NULL).
    { client_id: 'b8', id: 'b8', arete_local: '999', categoria: 'vaca', sexo: 'hembra', estado_vida: 'muerto', created_at: '2025-01-08', deleted_at: '2025-02-01' },
  ];
  await db.animales.bulkAdd(rows);
}

describe('AnimalesList', () => {
  let db;
  beforeEach(async () => {
    db = freshDb();
    await seedAnimales(db);
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('renderiza los 7 animales activos del seed (excluye el borrado)', async () => {
    render(<AnimalesList db={db} />);

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(screen.queryByText('Vaca Arete 999')).not.toBeInTheDocument();
  });

  it('la vaca_1 casi vacía no rompe el render y muestra "—" en campos faltantes', async () => {
    render(<AnimalesList db={db} />);

    const row = (await screen.findByText('Vaca Arete 1')).closest('li');
    expect(within(row).getByText('SINIIGA').nextSibling).toHaveTextContent('—');
    expect(within(row).getByText('Raza').nextSibling).toHaveTextContent('—');
    expect(within(row).getByText('Potrero actual').nextSibling).toHaveTextContent('—');
  });

  it('conserva el casing crudo de raza sin normalizar (brangus vs Brangus)', async () => {
    render(<AnimalesList db={db} />);
    await screen.findAllByRole('listitem');
    expect(screen.getByText('brangus')).toBeInTheDocument();
    expect(screen.getByText('Brangus')).toBeInTheDocument();
  });

  it('resuelve el potrero actual por nombre', async () => {
    render(<AnimalesList db={db} />);
    const row = (await screen.findByText('Becerro Arete 300')).closest('li');
    expect(within(row).getByText('Potrero actual').nextSibling).toHaveTextContent('El Jagüey');
  });

  it('filtra por categoría mediante tabs', async () => {
    render(<AnimalesList db={db} />);
    await screen.findAllByRole('listitem');

    fireEvent.click(screen.getByText('Crías'));

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
    expect(screen.getByText('Becerro Arete 92')).toBeInTheDocument();
    expect(screen.getByText('Becerra Arete 99')).toBeInTheDocument();
    expect(screen.getByText('Becerro Arete 300')).toBeInTheDocument();
    expect(screen.queryByText('Vaca Arete 1')).not.toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay animales', async () => {
    const emptyDb = freshDb();
    render(<AnimalesList db={emptyDb} />);

    expect(await screen.findByText('Todavía no hay animales registrados.')).toBeInTheDocument();
    await dropDb(emptyDb);
  });
});
