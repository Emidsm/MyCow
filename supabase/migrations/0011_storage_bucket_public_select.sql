-- ═══════════════════════════════════════════════════════════════════
-- 0011 — Política pública de SELECT para gestion_ganadera_fotos
--
-- getPublicUrl() genera URLs .../object/public/... que el browser
-- carga sin cabeceras de auth. Para que funcionen en <img> necesitan
-- una política que permita SELECT anónimo en el bucket.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS public_storage_select ON storage.objects;

CREATE POLICY public_storage_select ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'gestion_ganadera_fotos');
