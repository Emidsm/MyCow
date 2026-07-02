import { useMemo } from 'react';

function describeAnimal(a) {
  const arete = a.arete_local ? `Arete ${a.arete_local}` : 'sin arete';
  return `${arete} — ${a.categoria}`;
}

/**
 * Selector de madre/padre, offline-safe: lista TODOS los animales activos
 * locales (createAnimal/updateAnimal guardan el client_id elegido — ver
 * useAnimalMutations.js). `preferredCategoria` sólo reordena y sugiere, NUNCA
 * filtra ni bloquea: datos de campo imperfectos y registros que llegan tarde
 * (offline) son legítimos (v_integridad_padres es una vista de auditoría no
 * bloqueante, ver 0005_views.sql).
 */
export function ParentSelect({ label, animales, value, onChange, excludeClientId, preferredCategoria }) {
  const options = useMemo(() => {
    const candidates = animales.filter((a) => a.client_id !== excludeClientId);
    if (!preferredCategoria) return candidates;
    const preferred = candidates.filter((a) => a.categoria === preferredCategoria);
    const rest = candidates.filter((a) => a.categoria !== preferredCategoria);
    return [...preferred, ...rest];
  }, [animales, excludeClientId, preferredCategoria]);

  const selected = animales.find((a) => a.client_id === value);
  const showWarning = Boolean(
    selected && preferredCategoria && selected.categoria !== preferredCategoria
  );

  return (
    <label className="animal-form__field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Ninguno —</option>
        {options.map((a) => (
          <option key={a.client_id} value={a.client_id}>
            {describeAnimal(a)}
          </option>
        ))}
      </select>
      {showWarning && (
        <span className="animal-form__warning" role="alert">
          El animal elegido no es {preferredCategoria === 'semental' ? 'un semental' : `de categoría "${preferredCategoria}"`}; se guarda igual (no bloqueante).
        </span>
      )}
    </label>
  );
}
