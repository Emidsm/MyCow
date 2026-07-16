import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { AnimalForm } from '../AnimalForm.jsx';
import { AnimalesList } from '../AnimalesList.jsx';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('AnimalForm', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('crea un animal válido y cierra el form', async () => {
    const onClose = vi.fn();
    render(<AnimalForm db={db} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Arete morado'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'vaca' } });
    // Sexo se auto-asigna a 'hembra' para vaca y no se muestra

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const rows = await db.animales.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ arete_local: '55', categoria: 'vaca', sexo: 'hembra' });
  });

  it('seleccionar semental auto-asigna sexo macho y el form puede guardar', async () => {
    const onClose = vi.fn();
    render(<AnimalForm db={db} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'semental' } });
    // Sexo se auto-asigna a 'macho' y no se muestra el selector

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const rows = await db.animales.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ categoria: 'semental', sexo: 'macho' });
  });

  it('precarga un animal existente en modo edición', async () => {
    await db.animales.put({
      client_id: 'e1', arete_local: '3', categoria: 'vaca', sexo: 'hembra',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="e1" onClose={() => {}} />);

    expect(await screen.findByDisplayValue('3')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoría *')).toHaveValue('vaca');
    expect(screen.getByText('Editar animal')).toBeInTheDocument();
    expect(screen.getByText('Retirar')).toBeInTheDocument();
  });

  it('seleccionar vaca auto-asigna sexo hembra y oculta el selector', async () => {
    render(<AnimalForm db={db} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'vaca' } });

    // Sexo se auto-asigna internamente y el selector no se muestra
    expect(screen.queryByLabelText('Sexo')).not.toBeInTheDocument();
  });

  it('seleccionar semental auto-asigna sexo macho y oculta el selector', async () => {
    render(<AnimalForm db={db} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'semental' } });

    // Sexo se auto-asigna internamente y el selector no se muestra
    expect(screen.queryByLabelText('Sexo')).not.toBeInTheDocument();
  });

  it('seleccionar cría deja el sexo editable sin valor forzado', async () => {
    render(<AnimalForm db={db} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'cria' } });

    expect(screen.getByLabelText('Sexo')).toHaveValue('');
    expect(screen.getByLabelText('Sexo')).not.toBeDisabled();
  });

  it('bloquea guardar una vaca con sexo macho (carga de datos legacy)', async () => {
    // Simula un animal existente con datos inválidos (vaca + macho)
    await db.animales.put({
      client_id: 'legacy-vaca',
      arete_local: '99',
      categoria: 'vaca',
      sexo: 'macho',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    });

    render(<AnimalForm db={db} clientId="legacy-vaca" onClose={() => {}} />);

    await screen.findByDisplayValue('99');

    expect(screen.getByText('Guardar')).toBeDisabled();

    fireEvent.click(screen.getByText('Guardar'));

    expect(await db.animales.count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('retirar: confirma, hace softDelete y cierra', async () => {
    await db.animales.put({
      client_id: 'e2', arete_local: '4', categoria: 'vaca', sexo: 'hembra',
      updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    render(<AnimalForm db={db} clientId="e2" onClose={onClose} />);

    await screen.findByDisplayValue('4');
    fireEvent.click(screen.getByText('Retirar'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((await db.animales.get('e2')).deleted_at).toBeTruthy();

    confirmSpy.mockRestore();
  });
});

describe('AnimalesList — integración con AnimalForm', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('"+ Nuevo" abre el form de alta', async () => {
    render(<AnimalesList db={db} />);
    fireEvent.click(screen.getByText('+ Nuevo'));
    expect(await screen.findByText('Nuevo animal')).toBeInTheDocument();
  });

  it('tocar una fila abre el form de edición precargado', async () => {
    await db.animales.put({
      client_id: 'r1', arete_local: '20', categoria: 'vaca', sexo: 'hembra', estado_vida: 'activo',
      created_at: '2026-01-01', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    render(<AnimalesList db={db} />);
    await screen.findByText('Vaca Arete 20');
    fireEvent.click(screen.getByRole('button', { name: /Editar animal, Vaca arete 20/ }));

    expect(await screen.findByText('Editar animal')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('20')).toBeInTheDocument();
  });

  it('crear un animal actualiza la lista sola (useLiveQuery), sin refetch manual', async () => {
    render(<AnimalesList db={db} />);

    fireEvent.click(screen.getByText('+ Nuevo'));
    fireEvent.change(await screen.findByLabelText('Categoría *'), { target: { value: 'vaca' } });
    fireEvent.change(screen.getByLabelText('Arete morado'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(screen.queryByText('Nuevo animal')).not.toBeInTheDocument());
    expect(await screen.findByText('Vaca Arete 80')).toBeInTheDocument();
  });
});
