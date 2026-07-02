import { useState } from 'react';
import { db as defaultDb } from '../../sync/db.js';
import { useEventoMutations } from './useEventoMutations.js';
import './EventoForm.css';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Form de "Registrar venta". Evento terminal: al guardar, el trigger del
 * server marca estado_vida='vendido' (espejo optimista aplicado ya en
 * registrarVenta). Sin <form> nativo: el guardado es un handler controlado
 * en "Guardar".
 */
export function VentaForm({ db = defaultDb, animalClientId, onClose }) {
  const { registrarVenta } = useEventoMutations(db);

  const [fechaVenta, setFechaVenta] = useState(todayIso);
  const [pesoKg, setPesoKg] = useState('');
  const [comprador, setComprador] = useState('');
  const [precio, setPrecio] = useState('');
  const [moneda, setMoneda] = useState('MXN');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!fechaVenta) {
      setError('La fecha de venta es obligatoria.');
      return;
    }
    if (pesoKg !== '' && Number(pesoKg) < 0) {
      setError('El peso no puede ser negativo.');
      return;
    }
    if (precio !== '' && Number(precio) < 0) {
      setError('El precio no puede ser negativo.');
      return;
    }

    setSaving(true);
    try {
      await registrarVenta({
        animal_id: animalClientId,
        fecha_venta: fechaVenta,
        peso_kg: pesoKg,
        comprador,
        precio,
        moneda,
      });
      onClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo registrar la venta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="evento-form__overlay" role="dialog" aria-modal="true">
      <div className="evento-form">
        <header className="evento-form__header">
          <h2>Registrar venta</h2>
          <button type="button" className="evento-form__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="evento-form__body">
          <label className="evento-form__field">
            <span>Fecha de venta *</span>
            <input
              type="date"
              value={fechaVenta}
              onChange={(e) => setFechaVenta(e.target.value)}
            />
          </label>

          <label className="evento-form__field">
            <span>Peso (kg)</span>
            <input
              type="number"
              value={pesoKg}
              onChange={(e) => setPesoKg(e.target.value)}
            />
          </label>

          <label className="evento-form__field">
            <span>Comprador</span>
            <input type="text" value={comprador} onChange={(e) => setComprador(e.target.value)} />
          </label>

          <label className="evento-form__field">
            <span>Precio</span>
            <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>

          <label className="evento-form__field">
            <span>Moneda</span>
            <input type="text" value={moneda} onChange={(e) => setMoneda(e.target.value)} />
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
