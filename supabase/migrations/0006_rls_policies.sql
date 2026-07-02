-- ═══════════════════════════════════════════════════════════════════
-- 0006 — Row Level Security
--
-- ⚠️ POLÍTICA TEMPORAL: se habilita RLS en TODAS las tablas con una
-- política permisiva "cualquier usuario autenticado puede todo".
-- Se refinará en una fase posterior (multi-rancho / roles). Mientras
-- tanto, el rol `anon` NO tiene acceso a nada.
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

    -- Política permisiva temporal para authenticated.
    EXECUTE format('DROP POLICY IF EXISTS authenticated_todo ON %I', t);
    EXECUTE format(
      'CREATE POLICY authenticated_todo ON %I
         FOR ALL
         TO authenticated
         USING (true)
         WITH CHECK (true)', t);

    EXECUTE format(
      'COMMENT ON POLICY authenticated_todo ON %I IS
         ''TEMPORAL: acceso total para authenticated; refinar con roles/rancho en fase posterior.''', t);
  END LOOP;
END $$;
