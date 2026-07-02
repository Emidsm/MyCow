import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';
import './Dashboard.css';

export function Dashboard({ db = defaultDb }) {
  const data = useLiveQuery(async () => {
    const [animales, potreros] = await Promise.all([
      db.animales.filter((a) => a.deleted_at == null).toArray(),
      db.potreros.filter((p) => p.deleted_at == null).toArray(),
    ]);

    const total = animales.length;
    const porCategoria = {};
    const porEstado = {};
    for (const a of animales) {
      porCategoria[a.categoria] = (porCategoria[a.categoria] || 0) + 1;
      porEstado[a.estado_vida] = (porEstado[a.estado_vida] || 0) + 1;
    }

    return { total, porCategoria, porEstado, potreros: potreros.length };
  }, [db]);

  if (!data) {
    return <div className="dashboard"><p className="dashboard__status">Cargando…</p></div>;
  }

  const { total, porCategoria, porEstado, potreros } = data;

  return (
    <section className="dashboard">
      <h1 className="dashboard__title">Resumen</h1>

      <div className="dashboard__grid">
        <div className="dashboard__card">
          <span className="dashboard__card-value">{total}</span>
          <span className="dashboard__card-label">Animales</span>
        </div>
        <div className="dashboard__card">
          <span className="dashboard__card-value">{potreros}</span>
          <span className="dashboard__card-label">Potreros</span>
        </div>
      </div>

      <h2 className="dashboard__subtitle">Por categoría</h2>
      <div className="dashboard__grid dashboard__grid--sm">
        {Object.entries(porCategoria).map(([cat, count]) => (
          <div key={cat} className="dashboard__card dashboard__card--sm">
            <span className="dashboard__card-value">{count}</span>
            <span className="dashboard__card-label">{cat}</span>
          </div>
        ))}
      </div>

      <h2 className="dashboard__subtitle">Por estado</h2>
      <div className="dashboard__grid dashboard__grid--sm">
        {Object.entries(porEstado).map(([est, count]) => (
          <div key={est} className="dashboard__card dashboard__card--sm">
            <span className="dashboard__card-value">{count}</span>
            <span className="dashboard__card-label">{est}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
