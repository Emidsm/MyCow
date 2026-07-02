import './Calendario.css';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const today = new Date();
const currentMonth = today.getMonth();
const currentYear = today.getFullYear();
const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

export function Calendario() {
  return (
    <section className="calendario">
      <h1 className="calendario__title">Calendario</h1>
      <p className="calendario__month">{monthNames[currentMonth]} {currentYear}</p>

      <div className="calendario__grid">
        {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((d) => (
          <div key={d} className="calendario__day-name">{d}</div>
        ))}
        {Array.from({ length: new Date(currentYear, currentMonth, 1).getDay() }).map((_, i) => (
          <div key={`empty-${i}`} className="calendario__day calendario__day--empty" />
        ))}
        {days.map((d) => (
          <div
            key={d}
            className={`calendario__day ${d === today.getDate() ? 'calendario__day--today' : ''}`}
          >
            {d}
          </div>
        ))}
      </div>

      <p className="calendario__note">Próximamente: eventos reproductivos y alertas</p>
    </section>
  );
}
