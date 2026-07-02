import './AnimalesFilters.css';

/**
 * Filtro rápido client-side por categoría y estado de vida. Las opciones se
 * derivan de los valores presentes en la lista ya cargada (no se hardcodea
 * el ENUM del server), así el filtro nunca ofrece una categoría vacía.
 */
export function AnimalesFilters({
  categoriaOptions,
  estadoVidaOptions,
  categoria,
  estadoVida,
  onCategoriaChange,
  onEstadoVidaChange,
}) {
  return (
    <div className="animales-filters">
      <label className="animales-filters__field">
        <span>Categoría</span>
        <select value={categoria} onChange={(e) => onCategoriaChange(e.target.value)}>
          <option value="">Todas</option>
          {categoriaOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>

      <label className="animales-filters__field">
        <span>Estado</span>
        <select value={estadoVida} onChange={(e) => onEstadoVidaChange(e.target.value)}>
          <option value="">Todos</option>
          {estadoVidaOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
