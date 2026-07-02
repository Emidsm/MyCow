-- ═══════════════════════════════════════════════════════════════════
-- 0002 — Tablas
-- Modelo atómico: UNA sola tabla `animales` (vaca, semental, cría,
-- novillo/a son valores de `categoria`). Todo evento referencia por
-- animal_id (UUID), nunca por arete (string mutable).
--
-- Campos de soporte offline-first presentes en TODAS las tablas:
--   id         UUID PK (gen_random_uuid)
--   client_id  UUID UNIQUE — generado en el dispositivo, dedupe en sync
--   created_at / updated_at TIMESTAMPTZ
--   deleted_at TIMESTAMPTZ — soft delete; NULL = activo
-- ═══════════════════════════════════════════════════════════════════

-- potreros: divisiones físicas del rancho donde pastan los animales.
CREATE TABLE IF NOT EXISTS potreros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL,               -- UNIQUE entre no-borrados (índice parcial en 0003)
  activo      BOOLEAN DEFAULT true,
  -- campos offline
  client_id   UUID UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
COMMENT ON TABLE potreros IS 'Potreros (divisiones del rancho); el potrero actual de un animal se deriva de movimientos.';

-- animales: entidad unificada de TODO el ganado; la categoría es un
-- atributo mutable, el ascenso cría->vaca es un UPDATE trazado en
-- historial_categoria, nunca un registro nuevo.
CREATE TABLE IF NOT EXISTS animales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arete_local         TEXT,               -- identificador de negocio, puede repetirse en el tiempo, NO es PK
  arete_siniiga       TEXT,               -- puede ser NULL (crías sin registro oficial aún)
  categoria           categoria_animal NOT NULL,
  sexo                sexo_animal,
  raza                TEXT,
  color               TEXT,
  fecha_nacimiento    DATE,
  madre_id            UUID REFERENCES animales(id) ON DELETE SET NULL,
  padre_id            UUID REFERENCES animales(id) ON DELETE SET NULL,  -- debe ser un animal categoria='semental'
  estado_reproductivo estado_reprod DEFAULT 'na',
  estado_vida         estado_vida NOT NULL DEFAULT 'activo',
  potrero_actual_id   UUID REFERENCES potreros(id) ON DELETE SET NULL,  -- CACHE derivado de movimientos, NO fuente de verdad
  observaciones       TEXT,
  -- campos offline
  client_id           UUID UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  -- Regla de negocio 5: un semental es necesariamente macho.
  CONSTRAINT chk_semental_es_macho
    CHECK (categoria <> 'semental' OR sexo = 'macho')
);
COMMENT ON TABLE animales IS 'Entidad unificada de todo el ganado; vaca/semental/cría/novillo son valores de categoria.';
COMMENT ON COLUMN animales.potrero_actual_id IS 'Cache del último movimiento; la fuente de verdad es la vista v_potrero_actual.';

-- historial_categoria: bitácora de cada cambio de categoría
-- (trazabilidad del ascenso cría -> vaca, etc.).
CREATE TABLE IF NOT EXISTS historial_categoria (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id          UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  categoria_anterior categoria_animal,     -- NULL = alta inicial
  categoria_nueva    categoria_animal NOT NULL,
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- campos offline
  client_id          UUID UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
COMMENT ON TABLE historial_categoria IS 'Trazabilidad de cambios de categoria de un animal (p.ej. ascenso cria->vaca).';

-- movimientos: traslados entre potreros; FUENTE DE VERDAD del potrero
-- actual (el último movimiento por fecha/created_at).
CREATE TABLE IF NOT EXISTS movimientos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id          UUID NOT NULL REFERENCES animales(id) ON DELETE RESTRICT,
  potrero_origen_id  UUID REFERENCES potreros(id) ON DELETE SET NULL,   -- NULL = alta inicial
  potrero_destino_id UUID NOT NULL REFERENCES potreros(id) ON DELETE RESTRICT,
  fecha              DATE NOT NULL DEFAULT current_date,
  -- campos offline
  client_id          UUID UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
COMMENT ON TABLE movimientos IS 'Movimientos entre potreros; el último por (fecha, created_at) define el potrero actual.';

-- eventos_reproductivos: ciclos empadre/parto de una madre; resuelve
-- "una vaca, muchas crías" (cada parto enlaza opcionalmente su cría).
CREATE TABLE IF NOT EXISTS eventos_reproductivos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  madre_id      UUID NOT NULL REFERENCES animales(id) ON DELETE RESTRICT,
  padre_id      UUID REFERENCES animales(id) ON DELETE SET NULL,  -- semental
  fecha_empadre DATE,
  fecha_parto   DATE,
  cria_id       UUID REFERENCES animales(id) ON DELETE SET NULL,  -- la cría nacida, si aplica
  resultado     TEXT,   -- ej: 'parto_exitoso','aborto','no_gesto'
  -- campos offline
  client_id     UUID UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
COMMENT ON TABLE eventos_reproductivos IS 'Ciclos reproductivos (empadre/parto) de una madre; una vaca puede tener muchos.';

-- defunciones: evento terminal 1:1; su INSERT marca al animal como
-- 'muerto' vía trigger (0004).
CREATE TABLE IF NOT EXISTS defunciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id    UUID NOT NULL UNIQUE REFERENCES animales(id) ON DELETE RESTRICT,
  fecha_muerte DATE NOT NULL,
  causa        TEXT,
  -- campos offline
  client_id    UUID UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
COMMENT ON TABLE defunciones IS 'Defunción (evento terminal, 1:1 con animal); su alta marca estado_vida=muerto por trigger.';

-- ventas: evento terminal; su INSERT marca al animal como 'vendido'
-- vía trigger (0004).
CREATE TABLE IF NOT EXISTS ventas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id   UUID NOT NULL REFERENCES animales(id) ON DELETE RESTRICT,
  fecha_venta DATE NOT NULL,
  peso_kg     NUMERIC(7,2),
  comprador   TEXT,
  precio      NUMERIC(12,2),
  moneda      TEXT NOT NULL DEFAULT 'MXN',
  -- campos offline
  client_id   UUID UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
COMMENT ON TABLE ventas IS 'Venta de un animal (evento terminal); su alta marca estado_vida=vendido por trigger.';

-- fotos: fotografías atómicas por animal (nunca arrays en la fila);
-- storage_path apunta al bucket de Supabase Storage.
CREATE TABLE IF NOT EXISTS fotos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id    UUID NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,   -- ruta en el bucket de Supabase Storage
  es_principal BOOLEAN DEFAULT false,
  -- campos offline
  client_id    UUID UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
COMMENT ON TABLE fotos IS 'Fotos de un animal, una fila por foto; apuntan a Supabase Storage.';
