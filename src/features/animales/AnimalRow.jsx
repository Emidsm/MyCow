import './AnimalRow.css';

const DASH = '—';

const ESTADO_VIDA_CLASS = {
  activo: 'animal-row__badge--activo',
  muerto: 'animal-row__badge--muerto',
  vendido: 'animal-row__badge--vendido',
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
export function AnimalRow({ animal, onClick }) {
  return (
    <li className="animal-row">
      <button
        type="button"
        className="animal-row__tap"
        onClick={onClick}
        aria-label={`Editar animal, arete ${fallback(animal.arete_local)}`}
      >
        <div className="animal-row__header">
          <span className="animal-row__arete">Arete {fallback(animal.arete_local)}</span>
          <span
            className={`animal-row__badge ${ESTADO_VIDA_CLASS[animal.estado_vida] ?? ''}`}
          >
            {animal.estado_vida}
          </span>
        </div>

        <dl className="animal-row__details">
          <div>
            <dt>Categoría</dt>
            <dd>{animal.categoria}</dd>
          </div>
          <div>
            <dt>Sexo</dt>
            <dd>{fallback(animal.sexo)}</dd>
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
