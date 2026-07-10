import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';
import { useAnimalMutations } from './useAnimalMutations.js';
import { ParentSelect } from './ParentSelect.jsx';
import { MovimientoForm } from '../movimientos/MovimientoForm.jsx';
import { MovimientoHistorial } from '../movimientos/MovimientoHistorial.jsx';
import { DefuncionForm } from '../eventos/DefuncionForm.jsx';
import { useEventos } from '../eventos/useEventos.js';
import { useFotos } from './useFotos.js';
import { FotoUpload } from './FotoUpload.jsx';
import { formatDate } from '../../utils.js';
import './AnimalForm.css';

// ENUMs replicados de 0001_extensions_and_enums.sql. Se hardcodean (a
// diferencia de AnimalesFilters, que deriva opciones de datos ya cargados)
// porque son el vocabulario cerrado del negocio, no una faceta de datos.
const CATEGORIA_OPTIONS = ['vaca', 'semental', 'cria'];
const SEXO_OPTIONS = ['macho', 'hembra'];
const ESTADO_REPROD_OPTIONS = ['horra', 'cargada', 'parida'];

function emptyForm() {
  return {
    arete_local: '',
    arete_siniiga: '',
    categoria: '',
    sexo: '',
    raza: '',
    color: '',
    fecha_nacimiento: '',
    estado_reproductivo: 'horra',
    madre_id: null,
    padre_id: null,
    potrero_actual_id: null,
    observaciones: '',
  };
}

function capitalize(s) {
  const map = { cria: 'Cría' };
  return map[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

function blankToNull(value) {
  return value.trim() === '' ? null : value;
}

/**
 * Formulario único de alta/edición de animales. `clientId` presente = editar
 * (precarga el registro); ausente = crear. Sin <form> con submit nativo:
 * el guardado es un handler controlado en el botón "Guardar".
 */
export function AnimalForm({ db = defaultDb, clientId = null, onClose }) {
  const isEdit = clientId != null;
  const { createAnimal, updateAnimal, softDeleteAnimal } = useAnimalMutations(db);

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);
  const [deathOpen, setDeathOpen] = useState(false);

  const animales = useLiveQuery(
    () => db.animales.filter((a) => a.deleted_at == null).toArray(),
    [db]
  );
  const potreros = useLiveQuery(
    () => db.potreros.filter((p) => p.deleted_at == null && p.activo !== false).toArray(),
    [db]
  );
  // Estado de vida en vivo (no sólo el snapshot de precarga): decide qué
  // acciones terminales se ofrecen y se actualiza solo cuando el espejo
  // optimista de registrarDefuncion/registrarVenta lo cambia.
  const animalActual = useLiveQuery(
    () => (isEdit ? db.animales.get(clientId) : undefined),
    [db, clientId, isEdit]
  );
  const estadoVida = animalActual?.estado_vida ?? 'activo';
  const esTerminal = estadoVida === 'muerto';
  const eventos = useEventos(isEdit ? clientId : null, db);
  const { fotos, fotoPrincipalUrl, addFoto, removeFoto } = useFotos(clientId, db);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    db.animales.get(clientId).then((rec) => {
      if (cancelled || !rec) return;
      setForm({
        arete_local: rec.arete_local ?? '',
        arete_siniiga: rec.arete_siniiga ?? '',
        categoria: rec.categoria ?? '',
        sexo: rec.sexo ?? '',
        raza: rec.raza ?? '',
        color: rec.color ?? '',
        fecha_nacimiento: rec.fecha_nacimiento ?? '',
        estado_reproductivo: rec.estado_reproductivo ?? (rec.sexo === 'hembra' ? 'horra' : null),
        madre_id: rec.madre_id ?? null,
        padre_id: rec.padre_id ?? null,
        potrero_actual_id: rec.potrero_actual_id ?? null,
        observaciones: rec.observaciones ?? '',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [db, clientId, isEdit]);

  function setField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'categoria') {
        if (value === 'vaca') next.sexo = 'hembra';
        else if (value === 'semental') next.sexo = 'macho';
      }
      return next;
    });
  }

  const sementalInvalido = form.categoria === 'semental' && form.sexo !== 'macho';
  const vacaInvalida = form.categoria === 'vaca' && form.sexo !== 'hembra';

  async function handleSubmit() {
    setError(null);

    if (!form.categoria) {
      setError('La categoría es obligatoria.');
      return;
    }
    if (sementalInvalido) {
      setError('Un semental debe ser macho: corrige el sexo o la categoría antes de guardar.');
      return;
    }
    if (vacaInvalida) {
      setError('Una vaca debe ser hembra: corrige el sexo o la categoría antes de guardar.');
      return;
    }

    const sexo =
      form.categoria === 'vaca' ? 'hembra' :
      form.categoria === 'semental' ? 'macho' :
      form.sexo || null;

    const payload = {
      arete_local: blankToNull(form.arete_local),
      arete_siniiga: blankToNull(form.arete_siniiga),
      categoria: form.categoria,
      sexo,
      raza: blankToNull(form.raza),
      color: blankToNull(form.color),
      fecha_nacimiento: form.fecha_nacimiento || null,
      estado_reproductivo: form.sexo === 'hembra' ? (form.estado_reproductivo || 'na') : null,
      madre_id: form.madre_id || null,
      padre_id: form.padre_id || null,
      potrero_actual_id: form.potrero_actual_id || null,
      observaciones: blankToNull(form.observaciones),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateAnimal(clientId, payload);
      } else {
        await createAnimal(payload);
      }
      onClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRetirar() {
    if (!window.confirm('¿Retirar este animal? Dejará de aparecer en la lista.')) return;
    setSaving(true);
    try {
      await softDeleteAnimal(clientId);
      onClose();
    } catch (err) {
      setError(err.message ?? 'No se pudo retirar.');
      setSaving(false);
    }
  }

  return (
    <div className="animal-form__overlay" role="dialog" aria-modal="true">
      <div className="animal-form">
        <header className="animal-form__header">
          <h2>{isEdit ? 'Editar animal' : 'Nuevo animal'}</h2>
          <button type="button" className="animal-form__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="animal-form__body">
          <label className="animal-form__field">
            <span>Arete morado</span>
            <input
              type="text"
              value={form.arete_local}
              onChange={(e) => setField('arete_local', e.target.value)}
            />
          </label>

          <label className="animal-form__field">
            <span>Arete SINIIGA</span>
            <input
              type="text"
              value={form.arete_siniiga}
              onChange={(e) => setField('arete_siniiga', e.target.value)}
            />
          </label>

          <label className="animal-form__field">
            <span>Categoría *</span>
            <select value={form.categoria} onChange={(e) => setField('categoria', e.target.value)}>
              <option value="">Selecciona…</option>
              {CATEGORIA_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {capitalize(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="animal-form__field">
            <span>Sexo</span>
            <select
              value={form.sexo}
              onChange={(e) => setField('sexo', e.target.value)}
              disabled={form.categoria === 'vaca' || form.categoria === 'semental'}
            >
              <option value="">Selecciona…</option>
              {SEXO_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {capitalize(s)}
                </option>
              ))}
            </select>
          </label>

          {sementalInvalido && (
            <p className="animal-form__error" role="alert">
              Un semental debe ser macho.
            </p>
          )}
          {vacaInvalida && (
            <p className="animal-form__error" role="alert">
              Una vaca debe ser hembra.
            </p>
          )}

          <div className="animal-form__field">
            <span>Foto</span>
            <FotoUpload
              dataUrl={fotoPrincipalUrl}
              onUpload={addFoto}
              onRemove={() => {
                const f = fotos?.[0];
                if (f) removeFoto(f.client_id);
              }}
            />
          </div>

          <label className="animal-form__field">
            <span>Raza</span>
            <input type="text" value={form.raza} onChange={(e) => setField('raza', e.target.value)} />
          </label>

          <label className="animal-form__field">
            <span>Color</span>
            <input type="text" value={form.color} onChange={(e) => setField('color', e.target.value)} />
          </label>

          <label className="animal-form__field">
            <span>Fecha de nacimiento</span>
            <input
              type="date"
              value={form.fecha_nacimiento}
              onChange={(e) => setField('fecha_nacimiento', e.target.value)}
            />
          </label>

          {form.sexo === 'hembra' && (
            <label className="animal-form__field">
              <span>Estado reproductivo</span>
              <select
                value={form.estado_reproductivo}
                onChange={(e) => setField('estado_reproductivo', e.target.value)}
              >
                {ESTADO_REPROD_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {capitalize(s)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <ParentSelect
            label="Madre"
            animales={animales ?? []}
            value={form.madre_id}
            onChange={(v) => setField('madre_id', v)}
            excludeClientId={clientId}
            sexo="hembra"
          />

          <ParentSelect
            label="Padre"
            animales={animales ?? []}
            value={form.padre_id}
            onChange={(v) => setField('padre_id', v)}
            excludeClientId={clientId}
            sexo="macho"
          />

          <label className="animal-form__field">
            <span>Potrero actual</span>
            <select
              value={form.potrero_actual_id ?? ''}
              onChange={(e) => setField('potrero_actual_id', e.target.value || null)}
            >
              <option value="">— Ninguno —</option>
              {(potreros ?? []).map((p) => (
                <option key={p.client_id} value={p.client_id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          {isEdit && !esTerminal && (
            <div className="animal-form__field">
              <span>Movimientos</span>
              <button
                type="button"
                className="animal-form__mover"
                onClick={() => setMovingOpen(true)}
              >
                Mover a potrero
              </button>
              <MovimientoHistorial db={db} animalClientId={clientId} />
            </div>
          )}

          {isEdit && !esTerminal && (
            <div className="animal-form__field">
              <span>Eventos terminales</span>
              <button type="button" className="animal-form__morir" onClick={() => setDeathOpen(true)}>
                Registrar muerte
              </button>
            </div>
          )}

          {isEdit && esTerminal && (
            <div className="animal-form__field">
              <span>Eventos terminales</span>
              <p className="animal-form__terminal-note">
                Este animal está marcado como <strong>{estadoVida}</strong>: no admite mover
                ni registrar muerte de nuevo.
              </p>
              {eventos.defuncion && (
                <dl className="animal-form__evento-detalle">
                  <div>
                    <dt>Fecha de muerte</dt>
                    <dd>{formatDate(eventos.defuncion.fecha_muerte)}</dd>
                  </div>
                  {eventos.defuncion.causa && (
                    <div>
                      <dt>Causa</dt>
                      <dd>{eventos.defuncion.causa}</dd>
                    </div>
                  )}
                </dl>
              )}

            </div>
          )}

          <label className="animal-form__field">
            <span>Observaciones</span>
            <textarea
              value={form.observaciones}
              onChange={(e) => setField('observaciones', e.target.value)}
              rows={3}
            />
          </label>

          {error && (
            <p className="animal-form__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="animal-form__footer">
          {isEdit && (
            <button
              type="button"
              className="animal-form__retirar"
              onClick={handleRetirar}
              disabled={saving}
            >
              Retirar
            </button>
          )}
          <div className="animal-form__footer-actions">
            <button type="button" className="animal-form__cancel" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              className="animal-form__save"
              onClick={handleSubmit}
              disabled={saving || sementalInvalido || vacaInvalida}
            >
              Guardar
            </button>
          </div>
        </footer>
      </div>

      {movingOpen && (
        <MovimientoForm db={db} animalClientId={clientId} onClose={() => setMovingOpen(false)} />
      )}

      {deathOpen && (
        <DefuncionForm db={db} animalClientId={clientId} onClose={() => setDeathOpen(false)} />
      )}

    </div>
  );
}
