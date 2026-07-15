import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';
import { capitalize, categoriaLabel } from '../../utils.js';
import { supabase } from '../../lib/supabaseClient.js';
import './AnimalRow.css';

const BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'mycow_fotos';

const DASH = '—';

const ESTADO_VIDA_CLASS = {
  activo: 'animal-row__badge--activo',
  muerto: 'animal-row__badge--muerto',
};

function fallback(value) {
  return value == null || value === '' ? DASH : value;
}

/**
 * Fila (card) de un animal. Datos imperfectos del seed real (p.ej. vaca_1,
 * casi vacía) no deben romper el render: todo campo opcional pasa por
 * `fallback()`. La raza se muestra TAL CUAL viene ('Brangus' vs 'brangus');
 * no se normaliza casing en la UI.
 */
export function AnimalRow({ animal, onClick, db = defaultDb }) {
  const fotoThumb = useLiveQuery(
    async () => {
      const f = await db.fotos.filter((f) => f.animal_id === animal.client_id && f.deleted_at == null).first();
      if (!f) return null;
      // Prioriza data_url local sobre Storage URL (requiere bucket público).
      const d = await db.fotos_data.get(f.client_id);
      if (d?.data_url) return d.data_url;
      if (f.storage_path) {
        const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(f.storage_path);
        return publicUrl;
      }
      return null;
    },
    [db, animal.client_id],
    null
  );

  return (
    <li className="animal-row">
      <button
        type="button"
        className="animal-row__tap"
        onClick={onClick}
        aria-label={`Editar animal, ${categoriaLabel(animal.categoria, animal.sexo)} arete ${fallback(animal.arete_local)}`}
      >
        <div className="animal-row__header">
          {fotoThumb && (
            <img src={fotoThumb} alt="" className="animal-row__thumb" />
          )}
          <span className="animal-row__arete">{categoriaLabel(animal.categoria, animal.sexo)} Arete {fallback(animal.arete_local)}</span>
          <span
            className={`animal-row__badge ${ESTADO_VIDA_CLASS[animal.estado_vida] ?? ''}`}
          >
            {capitalize(animal.estado_vida)}
          </span>
        </div>

        <dl className="animal-row__details">
          <div>
            <dt>Categoría</dt>
            <dd>{capitalize(animal.categoria)}</dd>
          </div>
          <div>
            <dt>Sexo</dt>
            <dd>{fallback(capitalize(animal.sexo))}</dd>
          </div>
          <div>
            <dt>Raza</dt>
            <dd>{fallback(animal.raza)}</dd>
          </div>
          <div>
            <dt>SINIIGA</dt>
            <dd>{fallback(animal.arete_siniiga)}</dd>
          </div>
          <div>
            <dt>Potrero actual</dt>
            <dd>{fallback(animal.potrero_nombre)}</dd>
          </div>
        </dl>
      </button>
    </li>
  );
}
