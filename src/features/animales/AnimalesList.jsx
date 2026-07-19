import { useMemo, useState } from 'react';
import { useAnimales } from '../../hooks/useAnimales.js';
import { AnimalesFilters } from './AnimalesFilters.jsx';
import { AnimalRow } from './AnimalRow.jsx';
import { AnimalForm } from './AnimalForm.jsx';
import { filterByEstadoVida } from './filters.js';
import { db as defaultDb } from '../../sync/db.js';
import './AnimalesList.css';

function matchesSearch(animal, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const fields = [
    animal.arete_local,
    animal.arete_siniiga,
    animal.nombre,
    animal.potrero_nombre,
    animal.raza,
    animal.color,
    animal.categoria,
  ];
  return fields.some((f) => f && f.toLowerCase().includes(q));
}

const TABS = [
  { key: '', label: 'Todas' },
  { key: 'vaca', label: 'Vacas' },
  { key: 'semental', label: 'Sementales' },
  { key: 'cria', label: 'Crías' },
];

const SORT_OPTIONS = [
  { key: 'arete', label: 'Arete morado' },
  { key: 'potrero', label: 'Potrero' },
];

function applySort(animales, sortBy) {
  if (sortBy === 'potrero') {
    return [...animales].sort((a, b) =>
      (a.potrero_nombre ?? '').localeCompare(b.potrero_nombre ?? '')
    );
  }
  return [...animales].sort((a, b) => {
    const na = Number(a.arete_local);
    const nb = Number(b.arete_local);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return (a.arete_local ?? '').localeCompare(b.arete_local ?? '', undefined, { numeric: true });
  });
}

/**
 * Lista reactiva de animales activos + alta/edición vía AnimalForm (modal).
 * Tras guardar, useAnimales (useLiveQuery) refleja el cambio solo; el form
 * sólo se cierra, sin refetch manual.
 *
 * Tabs de categoría (Todas / Vacas / Sementales / Crías) y selector de
 * orden (arete morado / potrero).
 */
export function AnimalesList({ db = defaultDb } = {}) {
  const { animales, isLoading } = useAnimales(db);
  const [categoriaTab, setCategoriaTab] = useState('');
  const [sortBy, setSortBy] = useState('arete');
  const [estadoVida, setEstadoVida] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // null = cerrado; { clientId: null } = alta; { clientId } = edición.
  const [formTarget, setFormTarget] = useState(null);

  const estadoVidaOptions = useMemo(() => {
    const values = [...new Set(animales.map((a) => a.estado_vida).filter((v) => v != null))];
    return values.sort();
  }, [animales]);

  const filtered = useMemo(() => {
    let result = animales;
    if (categoriaTab) {
      result = result.filter((a) => a.categoria === categoriaTab);
    }
    result = filterByEstadoVida(result, estadoVida);
    if (searchQuery) {
      result = result.filter((a) => matchesSearch(a, searchQuery));
    }
    return applySort(result, sortBy);
  }, [animales, categoriaTab, estadoVida, sortBy, searchQuery]);

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

      <div className="animales-list__tabs" role="tablist">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={categoriaTab === key}
            className={`animales-list__tab${categoriaTab === key ? ' animales-list__tab--active' : ''}`}
            onClick={() => setCategoriaTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="animales-list__search">
        <input
          type="search"
          placeholder="Buscar por arete, nombre, potrero, raza…"
          className="animales-list__search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="animales-list__search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Limpiar búsqueda"
          >
            ✕
          </button>
        )}
      </div>

      <AnimalesFilters
        estadoVidaOptions={estadoVidaOptions}
        estadoVida={estadoVida}
        onEstadoVidaChange={setEstadoVida}
        sortBy={sortBy}
        onSortChange={setSortBy}
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
        <AnimalForm db={db} clientId={formTarget.clientId} initialCategoria={categoriaTab || null} onClose={closeForm} />
      )}
    </section>
  );
}
