-- ═══════════════════════════════════════════════════════════════════
-- 0012 — Eliminar valores de ENUM sin uso
--
-- Limpieza de valores que existían en el ENUM pero que la app no
-- utiliza. Si hay datos existentes con estos valores, esta migración
-- fallará; en ese caso, migrar los datos primero.
--
-- Valores eliminados:
--   categoria_animal: novillo, novillona
--   estado_vida: vendido
--   estado_reprod: vacia, empadrada
-- ═══════════════════════════════════════════════════════════════════

-- ── categoria_animal: eliminar novillo, novillona ──────────────────
CREATE TYPE categoria_animal_new AS ENUM ('vaca', 'semental', 'cria');
ALTER TABLE animales
  ALTER COLUMN categoria TYPE categoria_animal_new
  USING categoria::text::categoria_animal_new;
DROP TYPE categoria_animal;
ALTER TYPE categoria_animal_new RENAME TO categoria_animal;

-- ── estado_vida: eliminar vendido ─────────────────────────────────
CREATE TYPE estado_vida_new AS ENUM ('activo', 'muerto');
ALTER TABLE animales
  ALTER COLUMN estado_vida TYPE estado_vida_new
  USING estado_vida::text::estado_vida_new;
DROP TYPE estado_vida;
ALTER TYPE estado_vida_new RENAME TO estado_vida;

-- ── estado_reprod: eliminar vacia, empadrada ─────────────────────
CREATE TYPE estado_reprod_new AS ENUM ('cargada', 'parida', 'na', 'horra');
ALTER TABLE animales
  ALTER COLUMN estado_reproductivo TYPE estado_reprod_new
  USING estado_reproductivo::text::estado_reprod_new;
DROP TYPE estado_reprod;
ALTER TYPE estado_reprod_new RENAME TO estado_reprod;

-- ── Trigger/function de ventas: ya no aplica ─────────────────────
-- fn_venta_marca_vendido y trg_venta_marca_vendido nunca se ejecutan
-- porque no hay código que inserte en ventas.
DROP TRIGGER IF EXISTS trg_venta_marca_vendido ON ventas;
DROP FUNCTION IF EXISTS fn_venta_marca_vendido();
