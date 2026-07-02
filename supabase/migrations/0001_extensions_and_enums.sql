-- ═══════════════════════════════════════════════════════════════════
-- 0001 — Extensiones y ENUMs
-- Base tipológica del modelo: extensión pgcrypto (gen_random_uuid)
-- y los tipos enumerados compartidos por todas las tablas.
-- ═══════════════════════════════════════════════════════════════════

-- pgcrypto: provee gen_random_uuid() para las PKs UUID.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CREATE TYPE no soporta IF NOT EXISTS: se envuelve en DO ... EXCEPTION
-- para que la migración sea idempotente.

-- categoria_animal: clasificación productiva de un animal.
-- El "ascenso" (cria -> vaca) es un UPDATE de esta columna, nunca un
-- registro nuevo (ver historial_categoria).
DO $$ BEGIN
  CREATE TYPE categoria_animal AS ENUM ('vaca', 'semental', 'cria', 'novillo', 'novillona');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- sexo_animal: sexo biológico.
DO $$ BEGIN
  CREATE TYPE sexo_animal AS ENUM ('macho', 'hembra');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- estado_vida: estado terminal del animal dentro del rancho.
DO $$ BEGIN
  CREATE TYPE estado_vida AS ENUM ('activo', 'muerto', 'vendido');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- estado_reprod: estado reproductivo actual ('na' = no aplica,
-- p. ej. machos o crías).
DO $$ BEGIN
  CREATE TYPE estado_reprod AS ENUM ('vacia', 'cargada', 'parida', 'empadrada', 'na');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
