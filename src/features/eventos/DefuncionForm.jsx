import { useState } from 'react';
import { db as defaultDb } from '../../sync/db.js';
import { useEventoMutations } from './useEventoMutations.js';
import './EventoForm.css';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Form de "Registrar muerte". Evento terminal: al guardar, el trigger del
 * server marca estado_vida='muerto' (espejo optimista aplicado ya en
 * registrarDefuncion). Sin <form> nativo: el guardado es un handler
 * controlado en "Guardar".
 */
export function DefuncionForm({ db = defaultDb, animalClientId, onClose }) {
  const { registrarDefuncion } = useEventoMutations(db);

  const [fechaMuerte, setFechaMuerte] = useState(todayIso);
  const [causa, setCausa] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!fechaMuerte) {
      setError('La fecha de muerte es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      await registrarDefuncion({ animal_id: animalClientId, fecha_muerte: fechaMuerte, causa });
      onClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar la defunción.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="evento-form__overlay" role="dialog" aria-modal="true">
      <div className="evento-form">
        <header className="evento-form__header">
          <h2>Registrar muerte</h2>
          <button type="button" className="evento-form__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="evento-form__body">
          <label className="evento-form__field">
            <span>Fecha de muerte *</span>
            <input
              type="date"
              value={fechaMuerte}
              onChange={(e) => setFechaMuerte(e.target.value)}
            />
          </label>

          <label className="evento-form__field">
            <span>Causa</span>
            <input type="text" value={causa} onChange={(e) => setCausa(e.target.value)} />
          </label>

          {error && (
            <p className="evento-form__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="evento-form__footer">
          <button type="button" className="evento-form__cancel" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="evento-form__save" onClick={handleSubmit} disabled={saving}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
