import './Reportes.css';

export function Reportes() {
  return (
    <section className="reportes">
      <h1 className="reportes__title">Reportes</h1>

      <div className="reportes__grid">
        <div className="reportes__card">
          <span className="reportes__card-icon">📄</span>
          <h2 className="reportes__card-title">Inventario</h2>
          <p className="reportes__card-desc">Listado completo de animales activos</p>
        </div>
        <div className="reportes__card">
          <span className="reportes__card-icon">📊</span>
          <h2 className="reportes__card-title">Movimientos</h2>
          <p className="reportes__card-desc">Historial de movimientos por potrero</p>
        </div>
        <div className="reportes__card">
          <span className="reportes__card-icon">📉</span>
          <h2 className="reportes__card-title">Bajas</h2>
          <p className="reportes__card-desc">Reporte de defunciones y ventas</p>
        </div>
        <div className="reportes__card">
          <span className="reportes__card-icon">💰</span>
          <h2 className="reportes__card-title">Ventas</h2>
          <p className="reportes__card-desc">Resumen de ingresos por ventas</p>
        </div>
      </div>

      <p className="reportes__note">Próximamente: exportación a PDF/CSV</p>
    </section>
  );
}
