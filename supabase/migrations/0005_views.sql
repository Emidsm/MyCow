-- ═══════════════════════════════════════════════════════════════════
-- 0005 — Vistas
-- ═══════════════════════════════════════════════════════════════════

-- v_potrero_actual: FUENTE DE VERDAD del potrero de cada animal,
-- derivada del último movimiento no borrado (fecha DESC y, como
-- desempate, created_at DESC). animales.potrero_actual_id es solo
-- un cache de optimización mantenido por trigger.
CREATE OR REPLACE VIEW v_potrero_actual AS
SELECT DISTINCT ON (m.animal_id)
       m.animal_id,
       m.potrero_destino_id AS potrero_id,
       p.nombre             AS potrero_nombre,
       m.fecha              AS fecha_movimiento,
       m.id                 AS movimiento_id
  FROM movimientos m
  JOIN potreros p ON p.id = m.potrero_destino_id
 WHERE m.deleted_at IS NULL
 ORDER BY m.animal_id, m.fecha DESC, m.created_at DESC;

COMMENT ON VIEW v_potrero_actual IS 'Potrero actual de cada animal derivado del último movimiento; fuente de verdad (el cache animales.potrero_actual_id es solo optimización).';

-- ── Auditoría de parentescos (NO bloqueante) ────────────────────────
-- El sync offline nunca debe fallar por orden de llegada de registros,
-- así que padre_id NO se valida con triggers/constraints. Estas vistas
-- son de REVISIÓN: listan referencias de padre que hoy no apuntan a un
-- semental activo, para corregirlas a posteriori.
--
-- DECISIÓN: dos vistas separadas en lugar de una UNION, porque la fila
-- auditada tiene grano distinto (animal vs evento reproductivo) y
-- columnas de contexto distintas (arete_local vs madre_id); una UNION
-- obligaría a rellenar con NULLs y a distinguir el origen por columna.

-- v_integridad_padres: animales cuyo padre_id NO apunta a un semental
-- activo (categoría distinta o padre soft-borrado).
CREATE OR REPLACE VIEW v_integridad_padres AS
SELECT
  a.id            AS animal_id,
  a.arete_local,
  a.padre_id,
  p.categoria     AS categoria_del_padre
FROM animales a
JOIN animales p ON p.id = a.padre_id
WHERE a.deleted_at IS NULL
  AND a.padre_id IS NOT NULL
  AND (p.categoria <> 'semental' OR p.deleted_at IS NOT NULL);

COMMENT ON VIEW v_integridad_padres IS 'Auditoría no bloqueante: animales cuyo padre_id no apunta a un semental activo; es una vista de revisión, no un constraint.';

-- v_integridad_padres_eventos: eventos reproductivos cuyo padre_id NO
-- apunta a un semental activo (mismo chequeo, grano de evento).
CREATE OR REPLACE VIEW v_integridad_padres_eventos AS
SELECT
  e.id            AS evento_id,
  e.madre_id,
  e.padre_id,
  p.categoria     AS categoria_del_padre
FROM eventos_reproductivos e
JOIN animales p ON p.id = e.padre_id
WHERE e.deleted_at IS NULL
  AND e.padre_id IS NOT NULL
  AND (p.categoria <> 'semental' OR p.deleted_at IS NOT NULL);

COMMENT ON VIEW v_integridad_padres_eventos IS 'Auditoría no bloqueante: eventos reproductivos cuyo padre_id no apunta a un semental activo; vista de revisión, no un constraint.';
