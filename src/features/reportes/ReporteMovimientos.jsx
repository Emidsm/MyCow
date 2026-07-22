import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllMovimientos } from '../../hooks/useAllMovimientos.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate } from '../../utils.js';
import { DateFilter, filterByDateRange } from './DateFilter.jsx';
import { CorregirLoteModal } from '../movimientos/CorregirLoteModal.jsx';
import { softDelete } from '../../sync/writes.js';
import { db as defaultDb } from '../../sync/db.js';
import './ReportesSub.css';

function groupMovimientos(movimientos) {
  const groups = new Map();
  for (const m of movimientos) {
    const key = `${m.fecha}||${m.potrero_origen_id ?? ''}||${m.potrero_destino_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        fecha: m.fecha,
        potrero_origen_nombre: m.potrero_origen_nombre,
        potrero_destino_nombre: m.potrero_destino_nombre,
        detalle: m.detalle,
        aretes: [],
        movementIds: [],
        animalIds: [],
      });
    }
    const g = groups.get(key);
    g.aretes.push(m.animal_arete ?? '—');
    g.movementIds.push(m.client_id);
    if (m.animal_id) g.animalIds.push(m.animal_id);
  }
  return Array.from(groups.values());
}

export function ReporteMovimientos({ db = defaultDb }) {
  const navigate = useNavigate();
  const { movimientos, isLoading } = useAllMovimientos(db);
  const [dateFilter, setDateFilter] = useState({ preset: '30d' });
  const [expandedKeys, setExpandedKeys] = useState(new Set());
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [deletingKey, setDeletingKey] = useState(null);
  const [correctingAnimalIds, setCorrectingAnimalIds] = useState(null);

  const filtered = useMemo(() => {
    const range = { desde: dateFilter.desde, hasta: dateFilter.hasta };
    return filterByDateRange(movimientos, 'fecha', range);
  }, [movimientos, dateFilter]);

  const groups = useMemo(() => groupMovimientos(filtered), [filtered]);

  const allKeys = groups.map((g) => g.key);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));

  function toggleGroup(key) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelect(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allKeys));
    }
  }

  async function handleDeleteGroup(g) {
    const count = g.movementIds.length;
    const ok = window.confirm(`¿Eliminar ${count} movimiento${count > 1 ? 's' : ''} del ${formatDate(g.fecha)}?`);
    if (!ok) return;
    setDeletingKey(g.key);
    try {
      for (const mid of g.movementIds) {
        await softDelete(db, 'movimientos', mid);
      }
    } catch (err) {
      window.alert('No se pudo eliminar: ' + err.message);
    } finally {
      setDeletingKey(null);
    }
  }

  function handleOpenCorregir() {
    const ids = [];
    for (const g of groups) {
      if (selectedKeys.has(g.key)) {
        ids.push(...g.animalIds);
      }
    }
    if (ids.length === 0) return;
    setCorrectingAnimalIds([...new Set(ids)]);
  }

  return (
    <>
      <section className="reporte-sub">
        <header className="reporte-sub__header">
          <button type="button" className="reporte-sub__back" onClick={() => navigate('/reportes')}>
            ← Volver
          </button>
          <h1 className="reporte-sub__title">Historial de Movimientos</h1>
        </header>

        <div className="reporte-sub__summary">
          <div className="reporte-sub__stat">
            <span className="reporte-sub__stat-value">{movimientos.length}</span>
            <span className="reporte-sub__stat-label">Total</span>
          </div>
          <div className="reporte-sub__stat">
            <span className="reporte-sub__stat-value">{filtered.length}</span>
            <span className="reporte-sub__stat-label">En rango</span>
          </div>
        </div>

        <DateFilter value={dateFilter} onChange={setDateFilter} />

        <div className="reporte-sub__corregir">
          <button
            type="button"
            className="reporte-sub__corregir-btn"
            disabled={selectedKeys.size === 0}
            onClick={handleOpenCorregir}
          >
            Corregir lote{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ''}
          </button>
        </div>

        {isLoading && <p className="reporte-sub__status">Cargando…</p>}

        {!isLoading && groups.length === 0 && (
          <p className="reporte-sub__status">No hay movimientos en el rango seleccionado.</p>
        )}

        {!isLoading && groups.length > 0 && (
          <div className="reporte-sub__table-wrap">
            <table className="reporte-sub__table">
              <thead>
                <tr>
                  <th className="reporte-sub__th-check">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  </th>
                  <th>Fecha</th>
                  <th>Animales</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Detalle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isExpanded = expandedKeys.has(g.key);
                  const isChecked = selectedKeys.has(g.key);
                  const isDeleting = deletingKey === g.key;
                  return [
                    <tr key={g.key} className={`reporte-sub__row-group${isChecked ? ' reporte-sub__row-group--selected' : ''}`}>
                        <td className="reporte-sub__td-check">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(g.key)}
                          />
                        </td>
                        <td>{formatDate(g.fecha)}</td>
                        <td>
                          <button
                            type="button"
                            className="reporte-sub__arete-toggle"
                            onClick={() => toggleGroup(g.key)}
                            title={isExpanded ? 'Colapsar' : 'Ver aretes'}
                          >
                            {g.aretes.length}
                            <span className="reporte-sub__arete-chevron">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                        </td>
                        <td>{g.potrero_origen_nombre ?? '—'}</td>
                        <td>{g.potrero_destino_nombre ?? '—'}</td>
                        <td>{g.detalle ?? '—'}</td>
                        <td className="reporte-sub__td-actions">
                          <button
                            type="button"
                            className="reporte-sub__delete-btn"
                            onClick={() => handleDeleteGroup(g)}
                            disabled={isDeleting}
                            title="Eliminar grupo"
                          >
                            {isDeleting ? '…' : '×'}
                          </button>
                        </td>
                      </tr>,
                      isExpanded && g.aretes.map((arete, j) => (
                        <tr key={`${g.key}-arete-${j}`} className="reporte-sub__row-arete">
                          <td />
                          <td />
                          <td className="reporte-sub__arete-value">{arete}</td>
                          <td />
                          <td />
                          <td />
                          <td />
                        </tr>
                      )),
                    ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedKeys.size > 0 && (
        <div className="reporte-sub__selection-bar">
          <span>{selectedKeys.size} grupo{selectedKeys.size > 1 ? 's' : ''} seleccionado{selectedKeys.size > 1 ? 's' : ''}</span>
        </div>
      )}

      {correctingAnimalIds && (
        <CorregirLoteModal db={db} animalIds={correctingAnimalIds} onClose={() => setCorrectingAnimalIds(null)} />
      )}
    </>
  );
}
