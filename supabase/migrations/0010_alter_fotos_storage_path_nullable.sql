-- ═══════════════════════════════════════════════════════════════════
-- 0010 — Hacer storage_path nullable en fotos
--
-- Las fotos pueden guardarse solo localmente (offline) sin subir a
-- Storage. storage_path = NULL significa "solo local, sin copia en la
-- nube aún".
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE fotos ALTER COLUMN storage_path DROP NOT NULL;
