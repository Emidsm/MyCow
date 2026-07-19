import { useMemo, useState, useCallback } from 'react';
import { useAnimales } from '../../hooks/useAnimales.js';
import { AnimalesFilters } from './AnimalesFilters.jsx';
import { AnimalRow } from './AnimalRow.jsx';
import { AnimalForm } from './AnimalForm.jsx';
import { BulkMoveModal } from '../movimientos/BulkMoveModal.jsx';
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

function computeDuplicateAreteGroups(animales) {
  const groups = {};
  for (const a of animales) {
    const key = a.arete_local;
    if (key == null || key === '') continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }
  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => {
      const na = Number(a[0]);
      const nb = Number(b[0]);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    })
    .map(([arete, animals]) => ({ arete, animals }));
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
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

  const duplicateGroups = useMemo(() => computeDuplicateAreteGroups(animales), [animales]);
  const duplicateAnimalCount = useMemo(
    () => duplicateGroups.reduce((sum, g) => sum + g.animals.length, 0),
    [duplicateGroups]
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

  const toggleSelect = useCallback((clientId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }, []);

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function handleBulkMoveClick() {
    setBulkMoveOpen(true);
  }

  function closeBulkMove() {
    setBulkMoveOpen(false);
    exitSelectionMode();
  }

  return (
    <section className="animales-list">
      <header className="animales-list__header">
        <h1>Animales</h1>
        <div className="animales-list__header-actions">
          {selectionMode ? (
            <button type="button" className="animales-list__select-cancel" onClick={exitSelectionMode}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="animales-list__select-btn" onClick={() => setSelectionMode(true)}>
              Seleccionar
            </button>
          )}
          <button type="button" className="animales-list__create" onClick={handleCreate}>
            + Nuevo
          </button>
        </div>
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

      {!isLoading && duplicateGroups.length > 0 && (
        <div className="duplicates-panel">
          <button
            type="button"
            className="duplicates-panel__toggle"
            onClick={() => setDuplicatesOpen((v) => !v)}
            aria-expanded={duplicatesOpen}
          >
            <span className="duplicates-panel__icon">⚠</span>
            <span className="duplicates-panel__summary">
              {duplicateGroups.length} arete{duplicateGroups.length !== 1 ? 's' : ''} duplicado{duplicateGroups.length !== 1 ? 's' : ''}{' '}
              ({duplicateAnimalCount} animal{duplicateAnimalCount !== 1 ? 'es' : ''})
            </span>
            <span className={`duplicates-panel__chevron${duplicatesOpen ? ' duplicates-panel__chevron--open' : ''}`}>
              ▸
            </span>
          </button>
          {duplicatesOpen && (
            <ul className="duplicates-panel__list">
              {duplicateGroups.map(({ arete, animals }) => (
                <li key={arete} className="duplicates-panel__group">
                  <span className="duplicates-panel__arete">Arete {arete}</span>
                  <span className="duplicates-panel__group-count">{animals.length}×</span>
                  <span className="duplicates-panel__names">
                    {animals.map((a) => {
                      const label = a.nombre
                        ? `${a.nombre} (${a.categoria ?? '?'})`
                        : `${a.categoria ?? '?'} sin nombre`;
                      return label;
                    }).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            <AnimalRow
              key={animal.client_id}
              animal={animal}
              onClick={() => handleEdit(animal)}
              selectionMode={selectionMode}
              selected={selectedIds.has(animal.client_id)}
              onToggle={toggleSelect}
            />
          ))}
        </ul>
      )}

      {selectionMode && selectedIds.size > 0 && (
        <div className="animales-list__bulk-bar">
          <span className="animales-list__bulk-count">
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button type="button" className="animales-list__bulk-move" onClick={handleBulkMoveClick}>
            Mover a potrero
          </button>
        </div>
      )}

      {formTarget && (
        <AnimalForm db={db} clientId={formTarget.clientId} initialCategoria={categoriaTab || null} onClose={closeForm} />
      )}

      {bulkMoveOpen && (
        <BulkMoveModal db={db} animalIds={[...selectedIds]} onClose={closeBulkMove} />
      )}
    </section>
  );
}
