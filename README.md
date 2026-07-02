# MyCow

PWA de gestión ganadera offline-first.
Stack: React (Vite) + Supabase (Postgres, sin ORM) + migraciones SQL puras +
Dexie.js (IndexedDB) para el soporte offline + Auth de Supabase (email +
contraseña).

## Estructura

```
/supabase
  /migrations
    0001_extensions_and_enums.sql    # pgcrypto + ENUMs
    0002_tables.sql                  # tablas (modelo atómico: una sola tabla animales)
    0003_indexes.sql                 # índices y unicidades parciales (soft delete)
    0004_triggers_and_functions.sql  # updated_at, eventos terminales, cache de potrero
    0005_views.sql                   # v_potrero_actual + vistas de auditoría de parentescos
    0006_rls_policies.sql            # RLS habilitado, política TEMPORAL "authenticated todo" (histórico)
    0007_rls_final.sql               # RLS definitivo: políticas explícitas por operación (ver "Modelo de acceso")
/src
  /lib
    supabaseClient.js                # cliente único, lee SOLO de import.meta.env, fail-fast, sesión persistente
  /features
    /auth                           # AuthContext, AuthProvider (gate de sesión), LoginScreen, SignOutButton
  /sync                              # motor de sync headless (Dexie <-> Supabase), ver src/sync/engine.js
  /providers
    SyncProvider.jsx                 # arranca/detiene el scheduler de auto-sync, sólo con sesión activa
.env.example
```

## 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con los valores de tu proyecto (Dashboard de Supabase → Settings → API):

| Variable                 | Descripción                                  |
| ------------------------ | -------------------------------------------- |
| `VITE_SUPABASE_URL`      | Project URL del proyecto Supabase            |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key (segura en cliente con RLS)  |
| `VITE_APP_NAME`          | Nombre de la app                             |
| `VITE_APP_TAGLINE`       | Eslogan de la app                            |

`.env` **no se versiona**. Ningún archivo del repo contiene URLs ni keys hardcodeadas;
`src/lib/supabaseClient.js` lanza un error al arrancar si falta alguna variable.

## 2. Correr las migraciones (Supabase CLI)

```bash
# instalar CLI si no la tienes: https://supabase.com/docs/guides/cli
supabase login

# vincular el repo con tu proyecto remoto
supabase link --project-ref <PROJECT_REF>

# aplicar las migraciones de /supabase/migrations en orden
supabase db push
```

Para desarrollo local (Docker):

```bash
supabase start        # levanta Postgres local y aplica las migraciones
supabase db reset     # re-aplica migraciones desde cero + supabase/seed.sql
```

`supabase/seed.sql` contiene datos reales de campo (deliberadamente incompletos)
para probar la capa de sync. Es idempotente: UUIDs literales fijos y dedupe por
`ON CONFLICT (client_id) DO NOTHING`, así que puede re-ejecutarse sin duplicar.

Las migraciones son idempotentes donde Postgres lo permite
(`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER/POLICY IF EXISTS`,
bloques `DO` con captura de `duplicate_object` para los ENUMs).

## Notas del modelo

- **Una sola tabla `animales`**: vaca, semental, cría, novillo/a son valores del
  ENUM `categoria`. El ascenso cría→vaca es un `UPDATE` de `categoria` registrado
  en `historial_categoria`, nunca un registro nuevo.
- **Potrero actual**: la fuente de verdad es la vista `v_potrero_actual` (último
  movimiento por `fecha`, desempate por `created_at`). La columna
  `animales.potrero_actual_id` es solo un cache mantenido por trigger.
- **Referencias por `animal_id` (UUID)**, nunca por arete (string mutable).
- **Soft delete**: `deleted_at` en todas las tablas; las unicidades
  (`potreros.nombre`, `animales.arete_siniiga`) son índices parciales que solo
  aplican a filas no borradas.
- **Offline-first**: todas las tablas llevan `client_id UUID UNIQUE` (generado en
  el dispositivo) para deduplicar durante el sync que se implementará con Dexie.
- **Parentescos sin validación bloqueante**: `padre_id` "debe" apuntar a un
  semental, pero NO se valida con trigger/constraint porque el sync offline
  entrega registros en orden arbitrario (la cría puede llegar antes que el
  semental) y un rechazo haría fallar el drain de la cola. En su lugar, las
  vistas de auditoría `v_integridad_padres` (animales) y
  `v_integridad_padres_eventos` (eventos reproductivos) listan las referencias
  que no apuntan a un semental activo, para revisión posterior. Son dos vistas
  separadas porque el grano y las columnas de contexto difieren.
- **RLS**: habilitado en todas las tablas con políticas **definitivas**
  (`0007_rls_final.sql`) para el modelo "rancho único compartido" — ver
  sección siguiente para el detalle y el porqué.

## 3. Modelo de acceso y autenticación

### Decisión de arquitectura: un solo rancho compartido

MyCow es para un negocio familiar: el dueño y unos pocos trabajadores
comparten **todos** los datos del rancho. No hay roles ni jerarquía de
permisos entre usuarios autenticados, y deliberadamente **no** se agregó
`rancho_id`, `owner_id` ni una tabla de roles — sería sobre-ingeniería para
este tamaño de operación.

**Regla RLS final** (`0007_rls_final.sql`, reemplaza la política temporal de
`0006_rls_policies.sql`): cualquier usuario **autenticado** puede
`SELECT`/`INSERT`/`UPDATE`/`DELETE` en las 8 tablas de datos. El rol `anon`
no tiene ninguna policy, así que con RLS habilitado queda denegado por
defecto (0 filas, 0 escrituras) sin necesitar una policy "denegar" explícita.
Las políticas están separadas por operación (`authenticated_select`,
`authenticated_insert`, `authenticated_update`, `authenticated_delete` por
tabla) en vez de una sola `FOR ALL`, para que sean auditables y se puedan
refinar una por una si hace falta.

**Camino a multi-tenant** (NO implementado, para cuando el negocio crezca a
varios ranchos): agregar una columna `rancho_id` a cada tabla + una tabla
`ranchos` + una tabla de membresías `usuario_id <-> rancho_id`, y cambiar el
`USING`/`WITH CHECK` de cada policy de `0007_rls_final.sql` para filtrar por
`rancho_id IN (SELECT rancho_id FROM membresias WHERE usuario_id = auth.uid())`
en vez de `true`. Está documentado también como comentario en la propia
migración.

**Storage (fotos)**: el bucket para `fotos.storage_path` todavía no se ha
creado en este proyecto. `0007_rls_final.sql` deja el SQL de las políticas
de `storage.objects` (misma regla: authenticated lee/escribe, anon nada)
comentado como `TODO(fotos)`, listo para descomentar cuando se cree el
bucket.

### Cómo se crean los usuarios

La app implementa **sólo** `signIn` (email + contraseña,
`supabase.auth.signInWithPassword`). **No** hay registro (`signUp`) abierto
en la UI. Para un rancho familiar de pocos usuarios conocidos, dar de alta
las cuentas a mano desde el Dashboard de Supabase (**Authentication > Users
> Add user**) es más simple y más seguro que exponer un formulario de
registro público que cualquiera podría usar. Si en el futuro se necesita
auto-registro (p. ej. onboarding de más trabajadores sin intervención
manual), se puede agregar `signUp` detrás de un flag explícito.

### Sesión persistente y uso offline

`src/lib/supabaseClient.js` configura el cliente con
`persistSession: true`, `autoRefreshToken: true` y `storage: localStorage`
de forma explícita (documentado ahí mismo). Esto es **crítico** para el caso
de uso real: el usuario hace login una vez con señal, y luego la app debe
funcionar offline durante días sin volver a pedir credenciales.

`src/features/auth/AuthProvider.jsx` es el gate de sesión de toda la app
(montado en `App.jsx`):

- Al arrancar, llama a `supabase.auth.getSession()`, que lee la sesión del
  `storage` local **sin requerir red**. Si hay una sesión guardada y no
  vencida, la app entra directo — no bloquea esperando contactar al
  servidor. Esto es lo que garantiza el acceso offline con sesión
  persistida.
- `autoRefreshToken` intenta refrescar el access token en segundo plano; si
  falla por falta de red, sólo reintenta más tarde y no invalida la sesión
  ya restaurada.
- **Sin sesión** → se muestra `LoginScreen` y `<SyncProvider>` **ni
  siquiera se monta**: el scheduler de auto-sync (`engine.start()`) no
  arranca y no se toca la red sin credenciales.
- **Con sesión** (incluida una restaurada offline) → se monta la app real
  dentro de `<SyncProvider>`, que arranca el scheduler normalmente.

### Cierre de sesión y el outbox local

`signOut` (botón "Cerrar sesión", visible en la topbar) llama a
`supabase.auth.signOut()`, que **sólo limpia el token** de sesión guardado.
Deliberadamente **no** se borra la base Dexie local (ni el outbox de
operaciones pendientes) al cerrar sesión:

- En el modelo "rancho único compartido", los datos locales no son
  "propiedad" de la sesión que cierra — son del rancho, y cualquier usuario
  autenticado vuelve a tener acceso a ellos.
- Borrar la DB local forzaría a re-descargar todo el histórico en el
  siguiente login (mal para el caso offline-first).
- Peor: perdería silenciosamente cualquier operación aún no sincronizada en
  el outbox (p. ej. si alguien cierra sesión sin darse cuenta de que sigue
  offline con cambios pendientes).

Al volver a iniciar sesión (mismo usuario u otro del mismo rancho), el
outbox sigue drenándose normalmente en el siguiente ciclo de sync.

### Verificación de que RLS no rompe el sync (smoke test)

El motor de sync (`src/sync/engine.js`) usa el mismo cliente Supabase de
`src/lib/supabaseClient.js`; con una sesión válida, sus llamadas
(`push`→`upsert`, `pull`→`select`) se ejecutan como `authenticated` y no
necesitan ningún cambio para funcionar bajo `0007_rls_final.sql`.

Se validó manualmente contra un Postgres desechable (`postgres:16-alpine`
en Docker, sin el stack completo de Supabase — las políticas usan
`TO authenticated`/`TO anon`, que son roles de Postgres normales y no
dependen del schema `auth`):

1. Se aplicaron las 7 migraciones (`0001`→`0007`) en orden, **dos veces**
   seguidas sobre la misma base: la segunda pasada no lanzó ningún error
   (todas las migraciones son idempotentes: `DROP ... IF EXISTS` antes de
   cada `CREATE POLICY`).
2. Con un rol de conexión en `anon`: `SELECT` sobre una tabla de datos
   devuelve 0 filas (no error) e `INSERT` es rechazado con
   `new row violates row-level security policy`.
3. Con un rol de conexión en `authenticated`: `INSERT`, `SELECT`, `UPDATE`
   y `DELETE` funcionan sin restricción.

Para repetir el smoke test:

```bash
docker run -d --name mycow_rls_test -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine
# aplicar 0001..0007 con psql -f, dos veces
docker exec mycow_rls_test psql -U postgres -c \
  "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
   CREATE ROLE app_anon LOGIN PASSWORD 'x' IN ROLE anon;
   CREATE ROLE app_auth LOGIN PASSWORD 'x' IN ROLE authenticated;
   GRANT USAGE ON SCHEMA public TO anon, authenticated;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;"
# luego psql -U app_anon / -U app_auth para probar SELECT/INSERT como cada rol
docker rm -f mycow_rls_test
```

En Supabase real (hosted o `supabase start` local), PostgREST asigna el rol
`anon` o `authenticated` automáticamente según el JWT (o su ausencia) de
cada petición — el GRANT manual de arriba sólo hace falta para simular ese
comportamiento en un Postgres vainilla sin el stack de Supabase.

## 4. Tests

```bash
npm test
```

Vitest + Testing Library, sin red real (fake-indexeddb para Dexie, mocks de
`supabase.auth`/`supabase.from(...)` inyectados por props — nunca se importa
el cliente Supabase real dentro de un test). Cubre, entre otros:

- El motor de sync headless (push/pull/reentrancia/orden del outbox).
- CRUD de animales/movimientos/eventos y sus formularios.
- El gate de sesión (`src/features/auth/__tests__/AuthProvider.test.jsx`,
  `src/__tests__/App.test.jsx`): sin sesión → Login y el scheduler de sync
  no arranca; login exitoso → monta la app y arranca el sync; sesión
  persistida restaurada offline → entra directo sin bloquear en Login;
  `signOut` → vuelve a Login sin borrar el outbox local.

El caso de RLS contra Postgres real NO está en la suite de Vitest (no hay
Postgres en CI todavía): se documentó como smoke test manual arriba.

## Propuestas adicionales (marcadas en las migraciones)

- **`0003_indexes.sql`** (aprobada): índices sobre FKs de consulta frecuente
  (`historial_categoria.animal_id`, `eventos_reproductivos.madre_id`,
  `fotos.animal_id`, `ventas.animal_id`). Postgres no indexa FKs automáticamente;
  no cambian el modelo, solo aceleran listados.
