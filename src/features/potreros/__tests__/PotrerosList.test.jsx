import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { PotrerosList } from '../PotrerosList.jsx';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

async function seedPotreros(db) {
  const rows = [
    { client_id: 'p1', id: 'p1', nombre: 'Morones', activo: true, updated_at: '2025-01-01', deleted_at: null },
    { client_id: 'p2', id: 'p2', nombre: 'Mesas', activo: true, updated_at: '2025-01-01', deleted_at: null },
    { client_id: 'p3', id: 'p3', nombre: 'Sierra', activo: false, updated_at: '2025-01-01', deleted_at: null },
  ];
  await db.potreros.bulkAdd(rows);
}

describe('PotrerosList', () => {
  let db;
  beforeEach(async () => {
    db = freshDb();
    await seedPotreros(db);
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('renderiza los potreros activos del seed', async () => {
    render(<PotrerosList db={db} />);
    expect(await screen.findByText('Morones')).toBeInTheDocument();
    expect(screen.getByText('Mesas')).toBeInTheDocument();
    expect(screen.getByText('Sierra')).toBeInTheDocument();
  });

  it('abre el form de alta al hacer click en "+ Nuevo"', async () => {
    render(<PotrerosList db={db} />);
    await screen.findByText('Morones');
    fireEvent.click(screen.getByText('+ Nuevo'));
    expect(await screen.findByText('Nuevo potrero')).toBeInTheDocument();
  });

  it('abre el form de edición al hacer click en una card', async () => {
    render(<PotrerosList db={db} />);
    fireEvent.click(await screen.findByText('Morones'));
    expect(await screen.findByText('Editar potrero')).toBeInTheDocument();
  });

  it('crea un potrero y actualiza la lista sola', async () => {
    render(<PotrerosList db={db} />);
    await screen.findByText('Morones');
    fireEvent.click(screen.getByText('+ Nuevo'));
    fireEvent.change(await screen.findByLabelText('Nombre *'), { target: { value: 'Nuevo Potrero' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => {
      expect(screen.queryByText('Nuevo potrero')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Nuevo Potrero')).toBeInTheDocument();
    expect((await db.potreros.toArray()).length).toBe(4);
  });

  it("retirar: confirma, hace softDelete y desaparece de la lista", async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PotrerosList db={db} />);

    await screen.findByText('Morones');
    const card = screen.getByText('Morones').closest('.potreros__card');
    const retirarBtn = card.querySelector('.potreros__card-delete');
    fireEvent.click(retirarBtn);

    await waitFor(() => {
      expect(screen.queryByText('Morones')).not.toBeInTheDocument();
    });

    const allPotreros = await db.potreros.toArray();
    const deleted = allPotreros.filter((p) => p.deleted_at != null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].nombre).toBe('Morones');

    confirmSpy.mockRestore();
  });

  it('cancela retirar si el usuario no confirma', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<PotrerosList db={db} />);

    await screen.findByText('Morones');
    const moronesCard = screen.getByText('Morones').closest('.potreros__card');
    const retirarBtn = moronesCard.querySelector('.potreros__card-delete');
    fireEvent.click(retirarBtn);

    expect(screen.getByText('Morones')).toBeInTheDocument();
    expect(await db.potreros.count()).toBe(3);

    confirmSpy.mockRestore();
  });

  it('cuenta animales por potrero', async () => {
    await db.animales.put({
      client_id: 'a1', arete_local: '1', categoria: 'vaca', potrero_actual_id: 'p1',
      updated_at: '2025-01-01', deleted_at: null,
    });
    await db.animales.put({
      client_id: 'a2', arete_local: '2', categoria: 'vaca', potrero_actual_id: 'p1',
      updated_at: '2025-01-01', deleted_at: null,
    });

    render(<PotrerosList db={db} />);
    await screen.findByText('Morones');
    const card = screen.getByText('Morones').closest('.potreros__card');
    expect(card).toHaveTextContent('2 animales');
  });

  it('muestra estado vacío cuando no hay potreros', async () => {
    const emptyDb = freshDb();
    render(<PotrerosList db={emptyDb} />);
    expect(await screen.findByText('No hay potreros registrados.')).toBeInTheDocument();
    await dropDb(emptyDb);
  });
});
