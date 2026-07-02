import { useEffect, useState } from 'react';
import { db as defaultDb } from '../../sync/db.js';
import { usePotreroMutations } from './usePotreroMutations.js';
import './PotreroForm.css';

function emptyForm() {
  return { nombre: '', activo: true };
}

export function PotreroForm({ db = defaultDb, clientId = null, onClose }) {
  const isEdit = clientId != null;
  const { createPotrero, updatePotrero } = usePotreroMutations(db);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    db.potreros.get(clientId).then((rec) => {
      if (cancelled || !rec) return;
      setForm({ nombre: rec.nombre ?? '', activo: rec.activo !== false });
    });
    return () => {
      cancelled = true;
    };
  }, [db, clientId, isEdit]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setError(null);

    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updatePotrero(clientId, { nombre: form.nombre.trim(), activo: form.activo });
      } else {
        await createPotrero({ nombre: form.nombre.trim() });
      }
      onClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="potrero-form__overlay" role="dialog" aria-modal="true">
      <div className="potrero-form">
        <header className="potrero-form__header">
          <h2>{isEdit ? 'Editar potrero' : 'Nuevo potrero'}</h2>
          <button type="button" className="potrero-form__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="potrero-form__body">
          <label className="potrero-form__field">
            <span>Nombre *</span>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setField('nombre', e.target.value)}
              autoFocus
            />
          </label>

          {isEdit && (
            <label className="potrero-form__field potrero-form__checkbox">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setField('activo', e.target.checked)}
              />
              <span>Potrero activo</span>
            </label>
          )}

          {error && (
            <p className="potrero-form__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="potrero-form__footer">
          <button type="button" className="potrero-form__cancel" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="potrero-form__save"
            onClick={handleSubmit}
            disabled={saving}
          >
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
