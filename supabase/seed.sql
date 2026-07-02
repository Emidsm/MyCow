-- ═══════════════════════════════════════════════════════════════════
-- seed.sql — Datos reales de campo, deliberadamente imperfectos, para
-- probar la capa de sync offline contra el modelo atómico.
--
-- IDEMPOTENTE: cada fila lleva un UUID literal FIJO (nunca
-- gen_random_uuid()) y client_id = id; el dedupe es
-- INSERT ... ON CONFLICT (client_id) DO NOTHING, así que re-ejecutar
-- el seed no duplica filas ni re-dispara triggers.
--
-- Convención de UUIDs (para leerlos de un vistazo):
--   a0...  potreros      b0...  animales
--   c0...  eventos_reproductivos      d0...  movimientos
-- ═══════════════════════════════════════════════════════════════════

-- ── POTREROS (5) ────────────────────────────────────────────────────
INSERT INTO potreros (id, client_id, nombre, activo) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Morones',   true),  -- potrero_1 / Morones
  ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Mesas',     true),  -- potrero_2 / Mesas
  ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'Sierra',    true),  -- potrero_3 / Sierra
  ('a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'El Salto',  true),  -- potrero_4 / El Salto
  ('a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', 'El Jagüey', true)   -- potrero_5 / El Jagüey
ON CONFLICT (client_id) DO NOTHING;

-- ── ANIMALES (7) ────────────────────────────────────────────────────
-- Madres primero para que las crías puedan referenciarlas por FK.
-- Los NULL son datos que la data cruda NO trae: no se inventan.

-- vaca_1: registro casi vacío a propósito (solo arete y estado).
INSERT INTO animales (id, client_id, arete_local, categoria, sexo,
                      estado_reproductivo, estado_vida, observaciones) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',  -- vaca_1
   '1', 'vaca', 'hembra', 'vacia', 'activo', 'tirado')
ON CONFLICT (client_id) DO NOTHING;

-- vaca_2 / Puma: raza='quemada' viene así en la data cruda; se conserva tal cual.
INSERT INTO animales (id, client_id, arete_local, categoria, sexo, color, raza,
                      estado_reproductivo, estado_vida) VALUES
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',  -- vaca_2 / Puma
   '2', 'vaca', 'hembra', 'Puma', 'quemada', 'cargada', 'activo')
ON CONFLICT (client_id) DO NOTHING;

-- vaca_3: con registro SINIIGA.
INSERT INTO animales (id, client_id, arete_local, arete_siniiga, categoria, sexo,
                      raza, estado_reproductivo, estado_vida) VALUES
  ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',  -- vaca_3
   '3', '11814700', 'vaca', 'hembra', 'brangus', 'parida', 'activo')
ON CONFLICT (client_id) DO NOTHING;

-- vaca_4: con registro SINIIGA ('Brangus' con mayúscula, tal cual la data cruda).
INSERT INTO animales (id, client_id, arete_local, arete_siniiga, categoria, sexo,
                      raza, estado_reproductivo, estado_vida) VALUES
  ('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004',  -- vaca_4
   '4', '11814702', 'vaca', 'hembra', 'Brangus', 'parida', 'activo')
ON CONFLICT (client_id) DO NOTHING;

-- cria_92: cría de vaca_3; el padre es solo raza/procedencia en la data
-- cruda (no un registro individual), así que padre_id queda NULL y el
-- dato se conserva en observaciones.
INSERT INTO animales (id, client_id, arete_local, categoria, sexo,
                      fecha_nacimiento, madre_id, padre_id, estado_vida, observaciones) VALUES
  ('b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005',  -- cria_92
   '92', 'cria', 'macho', '2025-06-18',
   'b0000000-0000-4000-8000-000000000003',  -- madre: vaca_3
   NULL, 'activo',
   'padre: brangus durango (raza/procedencia, no registro individual)')
ON CONFLICT (client_id) DO NOTHING;

-- cria_99: cría de vaca_4; mismo caso de padre sin registro individual.
INSERT INTO animales (id, client_id, arete_local, categoria, sexo,
                      fecha_nacimiento, madre_id, padre_id, estado_vida, observaciones) VALUES
  ('b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006',  -- cria_99
   '99', 'cria', 'hembra', '2025-06-20',
   'b0000000-0000-4000-8000-000000000004',  -- madre: vaca_4
   NULL, 'activo',
   'padre: brangus durango (raza/procedencia, no registro individual)')
ON CONFLICT (client_id) DO NOTHING;

-- animal_300: INFERIDO desde el historial de movimientos; existe solo
-- para que los movimientos tengan animal_id válido (FK NOT NULL,
-- ON DELETE RESTRICT). No se inventan más datos suyos.
INSERT INTO animales (id, client_id, arete_local, categoria, sexo,
                      estado_vida, observaciones) VALUES
  ('b0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000007',  -- animal_300
   '300', 'novillo', NULL, 'activo',
   'Inferido desde historial de movimientos; datos pendientes de completar')
ON CONFLICT (client_id) DO NOTHING;

-- ── EVENTOS_REPRODUCTIVOS (2, uno por cría) ─────────────────────────
-- padre_id NULL: el padre no existe como registro individual.
INSERT INTO eventos_reproductivos (id, client_id, madre_id, padre_id,
                                   fecha_parto, cria_id, resultado) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',  -- parto vaca_3 -> cria_92
   'b0000000-0000-4000-8000-000000000003', NULL, '2025-06-18',
   'b0000000-0000-4000-8000-000000000005', 'parto_exitoso'),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002',  -- parto vaca_4 -> cria_99
   'b0000000-0000-4000-8000-000000000004', NULL, '2025-06-20',
   'b0000000-0000-4000-8000-000000000006', 'parto_exitoso')
ON CONFLICT (client_id) DO NOTHING;

-- ── MOVIMIENTOS (2, ambos de animal_300, mismo día) ─────────────────
-- Ambos movimientos comparten fecha='2025-09-07'; el desempate de
-- v_potrero_actual es created_at, y now() es FIJO dentro de una misma
-- transacción, así que se fija created_at explícito (hora de campo
-- aproximada) para que el orden cronológico real sea determinista.
-- El trigger de cache deja potrero_actual_id = El Salto (último insert).
INSERT INTO movimientos (id, client_id, animal_id, potrero_origen_id,
                         potrero_destino_id, fecha, created_at) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',  -- mov_1: Morones -> El Jagüey
   'b0000000-0000-4000-8000-000000000007',  -- animal_300
   'a0000000-0000-4000-8000-000000000001',  -- origen: Morones
   'a0000000-0000-4000-8000-000000000005',  -- destino: El Jagüey
   '2025-09-07', '2025-09-07 08:00:00+00'),
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002',  -- mov_2: El Jagüey -> El Salto
   'b0000000-0000-4000-8000-000000000007',  -- animal_300
   'a0000000-0000-4000-8000-000000000005',  -- origen: El Jagüey
   'a0000000-0000-4000-8000-000000000004',  -- destino: El Salto
   '2025-09-07', '2025-09-07 09:00:00+00')
ON CONFLICT (client_id) DO NOTHING;
