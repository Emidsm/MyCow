import { useMemo, useState } from 'react';
import { useAnimales } from '../../hooks/useAnimales.js';
import { AnimalesFilters } from './AnimalesFilters.jsx';
import { AnimalRow } from './AnimalRow.jsx';
import { AnimalForm } from './AnimalForm.jsx';
import { applyFilters, uniqueValues } from './filters.js';
import { db as defaultDb } from '../../sync/db.js';
import './AnimalesList.css';

/**
 * Lista reactiva de animales activos + alta/edición vía AnimalForm (modal).
 * Tras guardar, useAnimales (useLiveQuery) refleja el cambio solo; el form
 * sólo se cierra, sin refetch manual.
 */
export function AnimalesList({ db = defaultDb } = {}) {
  const { animales, isLoading } = useAnimales(db);
  const [categoria, setCategoria] = useState('');
  const [estadoVida, setEstadoVida] = useState('');
  // null = cerrado; { clientId: null } = alta; { clientId } = edición.
  const [formTarget, setFormTarget] = useState(null);

  const categoriaOptions = useMemo(() => uniqueValues(animales, 'categoria'), [animales]);
  const estadoVidaOptions = useMemo(() => uniqueValues(animales, 'estado_vida'), [animales]);
  const filtered = useMemo(
    () => applyFilters(animales, { categoria, estadoVida }),
    [animales, categoria, estadoVida]
  );

  function handleCreate() {
    setFormTarget({ clientId: null });
  }

  function handleEdit(animal) {
    setFormTarget({ clientId: animal.client_id });
  }

  function closeForm() {
    setFormTarget(null);
  }

  return (
    <section className="animales-list">
      <header className="animales-list__header">
        <h1>Animales</h1>
        <button type="button" className="animales-list__create" onClick={handleCreate}>
          + Nuevo
        </button>
      </header>

      <AnimalesFilters
        categoriaOptions={categoriaOptions}
        estadoVidaOptions={estadoVidaOptions}
        categoria={categoria}
        estadoVida={estadoVida}
        onCategoriaChange={setCategoria}
        onEstadoVidaChange={setEstadoVida}
      />

      {isLoading && <p className="animales-list__status">Cargando animales…</p>}

      {!isLoading && animales.length === 0 && (
        <p className="animales-list__status">Todavía no hay animales registrados.</p>
      )}

      {!isLoading && animales.length > 0 && filtered.length === 0 && (
        <p className="animales-list__status">Ningún animal coincide con el filtro.</p>
      )}

      {!isLoading && filtered.length > 0 && (
        <ul className="animales-list__rows">
          {filtered.map((animal) => (
            <AnimalRow key={animal.client_id} animal={animal} onClick={() => handleEdit(animal)} />
          ))}
        </ul>
      )}

      {formTarget && (
        <AnimalForm db={db} clientId={formTarget.clientId} onClose={closeForm} />
      )}
    </section>
  );
}
