-- ═══════════════════════════════════════════════════════════════════
-- 0004 — Funciones y triggers
-- Reglas de negocio transaccionales: updated_at automático, eventos
-- terminales (defunción/venta) que actualizan estado_vida, y cache
-- de potrero actual alimentado por movimientos.
-- Idempotencia: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════

-- ── Regla 3: updated_at automático ─────────────────────────────────

-- fn_set_updated_at: sella updated_at=now() en cada UPDATE.
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Trigger BEFORE UPDATE en TODAS las tablas de datos.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'potreros', 'animales', 'historial_categoria', 'movimientos',
    'eventos_reproductivos', 'defunciones', 'ventas', 'fotos'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', t);
  END LOOP;
END $$;

-- ── Regla 1a: defunción => estado_vida = 'muerto' ───────────────────

-- fn_defuncion_marca_muerto: al registrar una defunción, el animal
-- pasa a estado_vida='muerto' en la misma transacción.
CREATE OR REPLACE FUNCTION fn_defuncion_marca_muerto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE animales
     SET estado_vida = 'muerto'
   WHERE id = NEW.animal_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_defuncion_marca_muerto ON defunciones;
CREATE TRIGGER trg_defuncion_marca_muerto
  AFTER INSERT ON defunciones
  FOR EACH ROW EXECUTE FUNCTION fn_defuncion_marca_muerto();

-- ── Regla 1b: venta => estado_vida = 'vendido' ──────────────────────

-- fn_venta_marca_vendido: al registrar una venta, el animal pasa a
-- estado_vida='vendido' en la misma transacción.
CREATE OR REPLACE FUNCTION fn_venta_marca_vendido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE animales
     SET estado_vida = 'vendido'
   WHERE id = NEW.animal_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venta_marca_vendido ON ventas;
CREATE TRIGGER trg_venta_marca_vendido
  AFTER INSERT ON ventas
  FOR EACH ROW EXECUTE FUNCTION fn_venta_marca_vendido();

-- ── Regla 2: movimiento => refrescar cache potrero_actual_id ────────

-- fn_movimiento_actualiza_cache: mantiene el cache
-- animales.potrero_actual_id; la fuente de verdad sigue siendo la
-- vista v_potrero_actual (0005).
CREATE OR REPLACE FUNCTION fn_movimiento_actualiza_cache()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE animales
     SET potrero_actual_id = NEW.potrero_destino_id
   WHERE id = NEW.animal_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimiento_actualiza_cache ON movimientos;
CREATE TRIGGER trg_movimiento_actualiza_cache
  AFTER INSERT ON movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_movimiento_actualiza_cache();

-- ═══════════════════════════════════════════════════════════════════
-- NOTA DE ARQUITECTURA: NO existe validación bloqueante de que
-- padre_id apunte a un semental. El sync offline entrega registros en
-- orden arbitrario (la cría puede llegar antes que el semental) y un
-- trigger que rechace el INSERT haría fallar el drain de la cola.
-- La integridad de parentescos se AUDITA con las vistas no bloqueantes
-- v_integridad_padres / v_integridad_padres_eventos (0005).
-- Los DROP siguientes limpian el trigger en bases donde llegó a existir.
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_valida_padre_semental ON animales;
DROP TRIGGER IF EXISTS trg_valida_padre_semental_evento ON eventos_reproductivos;
DROP FUNCTION IF EXISTS fn_valida_padre_semental();
