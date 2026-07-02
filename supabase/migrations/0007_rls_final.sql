-- ═══════════════════════════════════════════════════════════════════
-- 0007 — RLS definitivo: modelo "rancho único compartido"
--
-- Reemplaza la política temporal de 0006 (authenticated_todo, FOR ALL
-- genérica) por políticas EXPLÍCITAS POR OPERACIÓN. El resultado de
-- acceso es el mismo (authenticated: todo; anon: nada) pero queda
-- auditable operación por operación, con nombres estables para poder
-- refinar cada una por separado el día que este modelo evolucione.
--
-- MODELO DE ACCESO (decisión de arquitectura, ver README):
--   Un solo rancho, negocio familiar: el dueño + pocos trabajadores
--   comparten TODOS los datos. SIN roles, SIN jerarquía de permisos:
--   cualquier usuario AUTENTICADO puede SELECT/INSERT/UPDATE/DELETE en
--   TODAS las tablas de datos. El rol `anon` no tiene ninguna policy
--   aquí → con RLS habilitado eso deniega por defecto (0 filas / 0
--   escrituras), sin necesidad de una policy "denegar todo" explícita.
--
--   Camino a multi-tenant (NO implementado; documentado para cuando el
--   negocio crezca a varios ranchos): agregar una columna `rancho_id`
--   a cada tabla + tabla `ranchos` + tabla de membresías
--   usuario↔rancho, y cambiar el USING/WITH CHECK de cada policy de
--   abajo para filtrar por
--     rancho_id IN (SELECT rancho_id FROM membresias WHERE usuario_id = auth.uid())
--   en vez de `true`. Hasta entonces, `rancho_id`/`owner_id`/roles
--   serían sobre-ingeniería para un negocio de un solo rancho.
--
--   Nota `TO authenticated` vs. `auth.role() = 'authenticated'`:
--   PostgREST/Supabase ya selecciona el rol de Postgres de la conexión
--   (anon | authenticated) a partir del JWT de la petición ANTES de
--   evaluar la policy. `TO authenticated` en la policy es la forma
--   idiomática y suficiente de "sólo autenticados", no depende del
--   schema `auth` (que sólo existe en el stack completo de Supabase),
--   así que estas políticas se pueden crear y validar contra un
--   Postgres desechable sin levantar todo el stack. Mismo criterio que
--   ya usaba 0006.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'potreros', 'animales', 'historial_categoria', 'movimientos',
    'eventos_reproductivos', 'defunciones', 'ventas', 'fotos'
  ] LOOP
    -- Habilitar (idempotente: ENABLE sobre una tabla ya habilitada no falla).
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Fuera la política temporal de 0006.
    EXECUTE format('DROP POLICY IF EXISTS authenticated_todo ON %I', t);

    -- Fuera las de esta misma migración, por si se re-corre (idempotente).
    EXECUTE format('DROP POLICY IF EXISTS authenticated_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_delete ON %I', t);

    EXECUTE format(
      'CREATE POLICY authenticated_select ON %I
         FOR SELECT
         TO authenticated
         USING (true)', t);

    EXECUTE format(
      'CREATE POLICY authenticated_insert ON %I
         FOR INSERT
         TO authenticated
         WITH CHECK (true)', t);

    EXECUTE format(
      'CREATE POLICY authenticated_update ON %I
         FOR UPDATE
         TO authenticated
         USING (true)
         WITH CHECK (true)', t);

    EXECUTE format(
      'CREATE POLICY authenticated_delete ON %I
         FOR DELETE
         TO authenticated
         USING (true)', t);

    EXECUTE format(
      'COMMENT ON POLICY authenticated_select ON %I IS
         ''Rancho único compartido: cualquier authenticated LEE todo. anon sin policy = sin acceso.''', t);
    EXECUTE format(
      'COMMENT ON POLICY authenticated_insert ON %I IS
         ''Rancho único compartido: cualquier authenticated INSERTA. Multi-tenant futuro: filtrar por rancho_id aquí.''', t);
    EXECUTE format(
      'COMMENT ON POLICY authenticated_update ON %I IS
         ''Rancho único compartido: cualquier authenticated ACTUALIZA cualquier fila (incluye soft-delete vía deleted_at).''', t);
    EXECUTE format(
      'COMMENT ON POLICY authenticated_delete ON %I IS
         ''Rancho único compartido: DELETE físico permitido a authenticated. La app sólo hace soft-delete, pero no se bloquea el hard-delete aquí.''', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Storage — bucket de fotos (fotos.storage_path, ver 0002_tables.sql)
--
-- TODO(fotos): a la fecha de esta migración el bucket de Supabase
-- Storage para fotos TODAVÍA NO se ha creado en este proyecto. Cuando
-- se cree (Dashboard > Storage, o `supabase storage buckets create`),
-- aplicar la misma regla que al resto: authenticated lee/escribe, anon
-- nada. Descomentar y ajustar `<BUCKET>` al nombre real elegido:
--
-- DROP POLICY IF EXISTS authenticated_storage_select ON storage.objects;
-- DROP POLICY IF EXISTS authenticated_storage_insert ON storage.objects;
-- DROP POLICY IF EXISTS authenticated_storage_update ON storage.objects;
-- DROP POLICY IF EXISTS authenticated_storage_delete ON storage.objects;
--
-- CREATE POLICY authenticated_storage_select ON storage.objects
--   FOR SELECT TO authenticated USING (bucket_id = '<BUCKET>');
-- CREATE POLICY authenticated_storage_insert ON storage.objects
--   FOR INSERT TO authenticated WITH CHECK (bucket_id = '<BUCKET>');
-- CREATE POLICY authenticated_storage_update ON storage.objects
--   FOR UPDATE TO authenticated USING (bucket_id = '<BUCKET>') WITH CHECK (bucket_id = '<BUCKET>');
-- CREATE POLICY authenticated_storage_delete ON storage.objects
--   FOR DELETE TO authenticated USING (bucket_id = '<BUCKET>');
-- ═══════════════════════════════════════════════════════════════════
