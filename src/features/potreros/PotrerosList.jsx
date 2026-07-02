import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';
import { usePotreroMutations } from './usePotreroMutations.js';
import { PotreroForm } from './PotreroForm.jsx';
import './PotrerosList.css';

export function PotrerosList({ db = defaultDb }) {
  const { deletePotrero } = usePotreroMutations(db);
  const [formTarget, setFormTarget] = useState(null);

  const data = useLiveQuery(async () => {
    const [potreros, animales] = await Promise.all([
      db.potreros.filter((p) => p.deleted_at == null).toArray(),
      db.animales.filter((a) => a.deleted_at == null).toArray(),
    ]);

    const countByPotrero = {};
    for (const a of animales) {
      if (a.potrero_actual_id) {
        countByPotrero[a.potrero_actual_id] = (countByPotrero[a.potrero_actual_id] || 0) + 1;
      }
    }

    return potreros.map((p) => ({
      ...p,
      animalCount: countByPotrero[p.client_id] || 0,
    }));
  }, [db]);

  if (!data) {
    return <div className="potreros"><p className="potreros__status">Cargando…</p></div>;
  }

  async function handleDelete(clientId, nombre) {
    if (!window.confirm(`¿Retirar "${nombre}"? Dejará de aparecer en la lista.`)) return;
    try {
      await deletePotrero(clientId);
    } catch {
      // soft errors are swallowed in the UI
    }
  }

  return (
    <section className="potreros">
      <header className="potreros__header">
        <h1 className="potreros__title">Potreros</h1>
        <button type="button" className="potreros__create" onClick={() => setFormTarget({ clientId: null })}>
          + Nuevo
        </button>
      </header>

      {data.length === 0 && (
        <p className="potreros__status">No hay potreros registrados.</p>
      )}

      <div className="potreros__grid">
        {data.map((potrero) => (
          <div
            key={potrero.client_id}
            className="potreros__card"
            role="button"
            tabIndex={0}
            aria-label={`Editar ${potrero.nombre}`}
            onClick={() => setFormTarget({ clientId: potrero.client_id })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFormTarget({ clientId: potrero.client_id });
              }
            }}
          >
            <div className="potreros__card-header">
              <h2 className="potreros__card-name">{potrero.nombre}</h2>
              <span className="potreros__card-area">
                {potrero.area_hectareas ? `${potrero.area_hectareas} ha` : null}
              </span>
            </div>
            <p className="potreros__card-count">
              {potrero.animalCount} animal{potrero.animalCount !== 1 ? 'es' : ''}
            </p>
            <button
              type="button"
              className="potreros__card-delete"
              aria-label={`Retirar ${potrero.nombre}`}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(potrero.client_id, potrero.nombre);
              }}
            >
              Retirar
            </button>
          </div>
        ))}
      </div>

      {formTarget && (
        <PotreroForm db={db} clientId={formTarget.clientId} onClose={() => setFormTarget(null)} />
      )}
    </section>
  );
}
