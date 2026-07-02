/**
 * Filtros puros sobre la lista de animales ya cargada de Dexie (client-side).
 * No tocan la base ni el motor de sync.
 */

export function filterByCategoria(animales, categoria) {
  if (!categoria) return animales;
  return animales.filter((a) => a.categoria === categoria);
}

export function filterByEstadoVida(animales, estadoVida) {
  if (!estadoVida) return animales;
  return animales.filter((a) => a.estado_vida === estadoVida);
}

export function applyFilters(animales, { categoria, estadoVida } = {}) {
  return filterByEstadoVida(filterByCategoria(animales, categoria), estadoVida);
}

/** Valores únicos presentes en `animales` para un campo dado, ordenados. */
export function uniqueValues(animales, field) {
  return [...new Set(animales.map((a) => a[field]).filter((v) => v != null))].sort();
}
