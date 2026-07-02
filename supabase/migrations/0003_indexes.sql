-- ═══════════════════════════════════════════════════════════════════
-- 0003 — Índices
-- Índices de consulta y unicidades parciales (que conviven con el
-- soft delete: la unicidad solo aplica a filas con deleted_at IS NULL).
-- ═══════════════════════════════════════════════════════════════════

-- potreros.nombre: UNIQUE solo entre los no-borrados.
CREATE UNIQUE INDEX IF NOT EXISTS uq_potreros_nombre_vivo
  ON potreros (nombre)
  WHERE deleted_at IS NULL;

-- animales.arete_local: búsqueda frecuente por arete de negocio
-- (NO único: un arete puede reutilizarse en el tiempo).
CREATE INDEX IF NOT EXISTS idx_animales_arete_local
  ON animales (arete_local);

-- animales.arete_siniiga: único entre animales vivos (no-borrados)
-- que sí tienen registro oficial.
CREATE UNIQUE INDEX IF NOT EXISTS uq_animales_arete_siniiga_vivo
  ON animales (arete_siniiga)
  WHERE deleted_at IS NULL AND arete_siniiga IS NOT NULL;

-- Filtros habituales del hato.
CREATE INDEX IF NOT EXISTS idx_animales_categoria
  ON animales (categoria);

CREATE INDEX IF NOT EXISTS idx_animales_estado_vida
  ON animales (estado_vida);

-- Genealogía: listar las crías de una madre.
CREATE INDEX IF NOT EXISTS idx_animales_madre_id
  ON animales (madre_id);

-- movimientos: índice compuesto para derivar el potrero actual
-- (último movimiento por animal) sin escanear la tabla.
CREATE INDEX IF NOT EXISTS idx_movimientos_animal_fecha
  ON movimientos (animal_id, fecha DESC, created_at DESC);

-- PROPUESTA ADICIONAL: índices sobre FKs consultadas con frecuencia
-- (Postgres no indexa FKs automáticamente). No añaden columnas ni
-- cambian el modelo; solo aceleran los listados por animal/madre.
CREATE INDEX IF NOT EXISTS idx_historial_categoria_animal
  ON historial_categoria (animal_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_reproductivos_madre
  ON eventos_reproductivos (madre_id);

CREATE INDEX IF NOT EXISTS idx_fotos_animal
  ON fotos (animal_id);

CREATE INDEX IF NOT EXISTS idx_ventas_animal
  ON ventas (animal_id);
