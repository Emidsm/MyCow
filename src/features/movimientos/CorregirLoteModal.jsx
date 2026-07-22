import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';
import { registrarMovimientoBatch } from './useMovimientoMutations.js';
import './CorregirLoteModal.css';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CorregirLoteModal({ db = defaultDb, animalIds, onClose }) {
  const [potreroDestinoId, setPotreroDestinoId] = useState('');
  const [fecha, setFecha] = useState(todayIso);
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const potreros = useLiveQuery(
    () => db.potreros.filter((p) => p.deleted_at == null && p.activo !== false).toArray(),
    [db]
  );

  async function handleSubmit() {
    setError(null);

    if (!potreroDestinoId) {
      setError('El potrero destino es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      const moved = await registrarMovimientoBatch(db, {
        animalIds,
        potrero_destino_id: potreroDestinoId,
        fecha,
        detalle: detalle.trim() || null,
      });
      setResult(moved);
    } catch (err) {
      setError(err.message ?? 'No se pudo corregir el lote.');
    } finally {
      setSaving(false);
    }
  }

  if (result != null) {
    return (
      <div className="corregir-overlay" role="dialog" aria-modal="true">
        <div className="corregir-modal">
          <header className="corregir-modal__header">
            <h2>Corregir lote</h2>
            <button type="button" className="corregir-modal__close" onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <div className="corregir-modal__body">
            <p className="corregir-modal__result">
              {result === 0
                ? 'Ningún animal se movió (ya estaban en ese potrero o no están activos).'
                : `${result} animal${result !== 1 ? 'es' : ''} movido${result !== 1 ? 's' : ''} exitosamente.`}
            </p>
          </div>
          <footer className="corregir-modal__footer">
            <button type="button" className="corregir-modal__save" onClick={onClose}>
              Cerrar
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="corregir-overlay" role="dialog" aria-modal="true">
      <div className="corregir-modal">
        <header className="corregir-modal__header">
          <h2>Corregir lote</h2>
          <button type="button" className="corregir-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="corregir-modal__body">
          <p className="corregir-modal__summary">
            Se moverán {animalIds.length} animal{animalIds.length !== 1 ? 'es' : ''} al potrero correcto.
          </p>

          <label className="corregir-modal__field">
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

          <label className="corregir-modal__field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>

          <label className="corregir-modal__field">
            <span>Motivo (opcional)</span>
            <textarea
              rows={2}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Por qué se corrige…"
            />
          </label>

          {error && (
            <p className="corregir-modal__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="corregir-modal__footer">
          <button type="button" className="corregir-modal__cancel" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="corregir-modal__save" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Moviendo…' : 'Corregir'}
          </button>
        </footer>
      </div>
    </div>
  );
}
