-- ═══════════════════════════════════════════════════════════════════
-- 0009 — RLS para Storage bucket mycow_fotos
--
-- Requisito: el bucket 'mycow_fotos' debe existir en Supabase Storage
-- (creado vía Dashboard o CLI). Fotos se almacenan como objetos en
-- este bucket y se referencian desde la tabla fotos.storage_path.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS authenticated_storage_select ON storage.objects;
DROP POLICY IF EXISTS authenticated_storage_insert ON storage.objects;
DROP POLICY IF EXISTS authenticated_storage_update ON storage.objects;
DROP POLICY IF EXISTS authenticated_storage_delete ON storage.objects;

CREATE POLICY authenticated_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'mycow_fotos');

CREATE POLICY authenticated_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mycow_fotos');

CREATE POLICY authenticated_storage_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'mycow_fotos') WITH CHECK (bucket_id = 'mycow_fotos');

CREATE POLICY authenticated_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'mycow_fotos');
