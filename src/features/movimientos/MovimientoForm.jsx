import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';
import { useMovimientoMutations } from './useMovimientoMutations.js';
import './MovimientoForm.css';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Form de "Mover a potrero". El origen NO es editable: se autodetecta del
 * cache local animales.potrero_actual_id (NULL = alta, se muestra como tal).
 * Sin <form> nativo: el guardado es un handler controlado en "Guardar".
 */
export function MovimientoForm({ db = defaultDb, animalClientId, onClose }) {
  const { registrarMovimiento } = useMovimientoMutations(db);

  const [potreroDestinoId, setPotreroDestinoId] = useState('');
  const [fecha, setFecha] = useState(todayIso);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const animal = useLiveQuery(() => db.animales.get(animalClientId), [db, animalClientId]);
  const potreros = useLiveQuery(
    () => db.potreros.filter((p) => p.deleted_at == null && p.activo !== false).toArray(),
    [db]
  );

  const potreroOrigenId = animal?.potrero_actual_id ?? null;
  const potreroOrigenNombre = potreroOrigenId
    ? ((potreros ?? []).find((p) => p.client_id === potreroOrigenId)?.nombre ?? potreroOrigenId)
    : 'Alta (sin potrero previo)';

  async function handleSubmit() {
    setError(null);

    if (!potreroDestinoId) {
      setError('El potrero destino es obligatorio.');
      return;
    }
    if (potreroDestinoId === potreroOrigenId) {
      setError('El potrero destino debe ser distinto del potrero de origen.');
      return;
    }

    setSaving(true);
    try {
      await registrarMovimiento({
        animal_id: animalClientId,
        potrero_destino_id: potreroDestinoId,
        fecha,
      });
      onClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="movimiento-form__overlay" role="dialog" aria-modal="true">
      <div className="movimiento-form">
        <header className="movimiento-form__header">
          <h2>Mover a potrero</h2>
          <button type="button" className="movimiento-form__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="movimiento-form__body">
          <label className="movimiento-form__field">
            <span>Potrero origen</span>
            <input type="text" value={potreroOrigenNombre} disabled readOnly />
          </label>

          <label className="movimiento-form__field">
            <span>Potrero destino *</span>
            <select value={potreroDestinoId} onChange={(e) => setPotreroDestinoId(e.target.value)}>
              <option value="">Selecciona…</option>
              {(potreros ?? []).map((p) => (
                <option key={p.client_id} value={p.client_id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="movimiento-form__field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>

          {error && (
            <p className="movimiento-form__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="movimiento-form__footer">
          <button type="button" className="movimiento-form__cancel" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="movimiento-form__save" onClick={handleSubmit} disabled={saving}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
