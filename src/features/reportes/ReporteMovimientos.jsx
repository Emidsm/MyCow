import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllMovimientos } from '../../hooks/useAllMovimientos.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate } from '../../utils.js';
import { DateFilter, filterByDateRange } from './DateFilter.jsx';
import { CorregirLoteModal } from '../movimientos/CorregirLoteModal.jsx';
import { db as defaultDb } from '../../sync/db.js';
import './ReportesSub.css';

function groupMovimientos(movimientos) {
  const groups = new Map();
  for (const m of movimientos) {
    const key = `${m.fecha}||${m.potrero_origen_id ?? ''}||${m.potrero_destino_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        fecha: m.fecha,
        potrero_origen_nombre: m.potrero_origen_nombre,
        potrero_destino_nombre: m.potrero_destino_nombre,
        detalle: m.detalle,
        aretes: [],
      });
    }
    groups.get(key).aretes.push(m.animal_arete ?? '—');
  }
  return Array.from(groups.values());
}

export function ReporteMovimientos({ db = defaultDb }) {
  const navigate = useNavigate();
  const { movimientos, isLoading } = useAllMovimientos(db);
  const [dateFilter, setDateFilter] = useState({ preset: '30d' });
  const [expandedKeys, setExpandedKeys] = useState(new Set());
  const [selectedPotreroId, setSelectedPotreroId] = useState('');
  const [correctingPotrero, setCorrectingPotrero] = useState(null);

  const potreros = useLiveQuery(
    () => db.potreros.filter((p) => p.deleted_at == null && p.activo !== false).toArray(),
    [db]
  );

  const filtered = useMemo(() => {
    const range = { desde: dateFilter.desde, hasta: dateFilter.hasta };
    return filterByDateRange(movimientos, 'fecha', range);
  }, [movimientos, dateFilter]);

  const groups = useMemo(() => groupMovimientos(filtered), [filtered]);

  const toggleGroup = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  function handleOpenCorregir() {
    const potrero = (potreros ?? []).find((p) => p.client_id === selectedPotreroId);
    if (!potrero) return;
    setCorrectingPotrero(potrero);
    setSelectedPotreroId('');
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
          <select
            className="reporte-sub__corregir-select"
            value={selectedPotreroId}
            onChange={(e) => setSelectedPotreroId(e.target.value)}
          >
            <option value="">Selecciona potrero a corregir…</option>
            {(potreros ?? []).map((p) => (
              <option key={p.client_id} value={p.client_id}>{p.nombre}</option>
            ))}
          </select>
          <button
            type="button"
            className="reporte-sub__corregir-btn"
            disabled={!selectedPotreroId}
            onClick={handleOpenCorregir}
          >
            Corregir lote
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
                  <th>Fecha</th>
                  <th>Animales</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const gKey = `${g.fecha}||${g.potrero_origen_nombre ?? ''}||${g.potrero_destino_nombre ?? ''}`;
                  const isExpanded = expandedKeys.has(gKey);
                  return [
                    <tr key={gKey} className="reporte-sub__row-group">
                        <td>{formatDate(g.fecha)}</td>
                        <td>
                          <button
                            type="button"
                            className="reporte-sub__arete-toggle"
                            onClick={() => toggleGroup(gKey)}
                            title={isExpanded ? 'Colapsar' : 'Ver aretes'}
                          >
                            {g.aretes.length}
                            <span className="reporte-sub__arete-chevron">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                        </td>
                        <td>{g.potrero_origen_nombre ?? '—'}</td>
                        <td>{g.potrero_destino_nombre ?? '—'}</td>
                        <td>{g.detalle ?? '—'}</td>
                      </tr>,
                      isExpanded && g.aretes.map((arete, j) => (
                        <tr key={`${gKey}-arete-${j}`} className="reporte-sub__row-arete">
                          <td />
                          <td className="reporte-sub__arete-value">{arete}</td>
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

      {correctingPotrero && (
        <CorregirLoteModal db={db} potrero={correctingPotrero} onClose={() => setCorrectingPotrero(null)} />
      )}
    </>
  );
}
