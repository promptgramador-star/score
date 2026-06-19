# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Marcador en tiempo real para torneo de baloncesto de exalumnos. 4 cuartos × 10 min, OT 5 min, bonus desde 5 faltas/período. Páginas HTML estáticas servidas por GitHub Pages; backend en Supabase (auth + realtime + storage).

## Stack

- HTML + CSS + JS vanilla. **Sin frameworks, sin build tools, sin package.json.** Cada `<script>` es inline.
- Supabase JS SDK v2 desde CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`).
- Barlow Condensed (Google Fonts) en todos los HTML.
- Deploy: GitHub Pages (contenido estático). El control de acceso lo da RLS, no esconder la URL/anon key — **ambos quedan visibles al cliente**.

## Estructura

| Archivo | Rol |
|---|---|
| `login.html`     | Auth (signIn) → `manage.html` |
| `manage.html`    | CRUD equipos/jugadores/partidos (requiere auth, 3 tabs) |
| `admin.html`     | Operador en vivo. Sin `?game=ID` → picker por rol/cancha |
| `scoreboard.html`| Marcador público, solo lectura, realtime. `?court=1/2` para modo cancha |
| `results.html`   | Generador de tarjeta PNG 1080×1080 (html2canvas) |
| `js/supabase-client.js` | Cliente Supabase + helpers (`getSession`, `signIn`, `requireAuth`, `uploadTeamLogo`, `recordGameEvent`, `undoLastEvent`, `subscribeToTable`, etc.) |
| `config.js`      | **En `.gitignore`** — credenciales duplicadas, NO se usa en runtime |
| `gitignore`      | Se commitea como `gitignore` (sin punto). Renombrar a `.gitignore` al inicializar git |

## Credenciales — fuente de verdad

El cliente real lee `SUPABASE_URL` y `SUPABASE_ANON_KEY` desde `js/supabase-client.js`. El `config.js` que está en la raíz **no se incluye** desde ningún HTML — es un duplicado huérfano que el usuario mantiene por separado. Si tocás uno, mantenelos alineados. **No revertir** cambios que el usuario haya hecho en estos dos archivos.

## Regla de trabajo — checkpoint por subetapa

Al terminar una subetapa funcional (login, manage tab, etc.), **detenerse y preguntar** antes de seguir. El usuario dicta explícitamente esta regla y la aplica antes de cerrar sesión. MEMORY.md en `/home/hector/.claude/projects/-var-www-html-torneo-exalumnos/memory/` se actualiza con:
- Estado de cada subetapa
- Decisiones técnicas con su justificación
- Historial de cambios relevantes
- Pendientes

Al retomar en sesión nueva, leer MEMORY.md antes de proponer cualquier cambio.

## Patrones arquitectónicos clave

- **Sin archivos de config externos.** CSS inline en cada `<style>` dentro del HTML. Sin `package.json`, sin bundler.
- **Modales:** cierre con `Escape`, click fuera del modal, y botón `×`. Eliminaciones con `confirm()`.
- **Estados de carga:** cada sección que carga datos muestra `loading`, `empty-state`, y `error-state` por separado.
- **Realtime: recalcular desde cero.** Tanto `admin.html` como `scoreboard.html` se suscriben a `game_events` filtrado por `game_id` y en cada INSERT/DELETE vuelven a fetchear todos los eventos y recalculan score/faltas. Es deliberadamente más simple que diff.
- **Reloj client-side.** `admin.html` corre `setInterval` y NO persiste `clock_seconds` en DB — solo lo manda como argumento en cada `record_game_event`. `scoreboard.html` lee el `clock_seconds` del evento más reciente (no corre reloj propio).
- **Cuartos:** C1–C4 + OT (5 min). Al cambiar, el reloj se resetea a la duración del período.
- **Bonus:** "⚠ BONUS" cuando un equipo llega a 5+ faltas. Badge rojo en scoreboard, amber a partir de 3.
- **RLS DELETE silencioso:** Supabase devuelve 200 con 0 filas (sin error) cuando RLS bloquea un DELETE. Usar siempre `.select('id')` post-delete para verificar que algo se borró.

## Base de datos (Supabase)

- Tablas: `tournaments`, `teams`, `players`, `games`, `game_events`, `player_game_stats`, `user_roles`.
- Funciones SQL usadas vía RPC: `record_game_event(...)`, `undo_last_event(...)`, `init_player_game_stats(...)`.
- RLS: anon lectura, authenticated escritura + DELETE. **No hay service_role key** en el proyecto.
- Project URL: `https://xsibnjbnkbzwcmfluvrm.supabase.co`.
- Storage bucket: `team-logos` para los logos PNG/JPG subidos desde `manage.html`.

### Políticas RLS de DELETE (ejecutar en SQL Editor de Supabase si faltan)
```sql
CREATE POLICY "auth delete games"        ON games             FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth delete events"       ON game_events       FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth delete stats"        ON player_game_stats FOR DELETE TO authenticated USING (true);
```

### Columnas clave de `games`
- `court TEXT` → `'court_1'` | `'court_2'`
- `round TEXT` → jornada libre ("Semana 1", "Semifinal"). Migración: `ALTER TABLE games ADD COLUMN IF NOT EXISTS round TEXT;`
- Joins PostgREST: `home_team:team_home_id(...)` y `away_team:team_away_id(...)` (NO `home_team_id`/`away_team_id` sin alias)

### Constraint `game_events_event_type_check` — valores EXACTOS
`points_1, points_2, points_3, points_minus_1, points_minus_2, points_minus_3,`  
`foul_personal, foul_technical, foul_flagrant, foul_undo,`  
`timeout, period_start, period_end, game_start, game_end,`  
`possession_home, possession_away, clock_adjust`

### user_roles
`role` válidos: `'admin'` | `'court_1'` | `'court_2'`. Sin fila → se trata como `admin` (ve todos los partidos).

## Cómo verificar cambios

No hay tests automatizados ni build step. Para verificar:

1. **Sintaxis del JS inline** de un HTML:
   ```bash
   node -e "const html = require('fs').readFileSync('NOMBRE.html','utf8'); const m = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]; new Function(m[m.length-1][1]); console.log('OK')"
   ```
2. **Conectividad con Supabase** (mismo método usado en sesión previa):
   ```bash
   curl -sS "https://xsibnjbnkbzwcmfluvrm.supabase.co/rest/v1/teams?select=id&limit=1" \
     -H "apikey: <SUPABASE_ANON_KEY>"
   ```
   Debe responder `200` con un JSON array.
3. **Visual:** abrir los HTML en navegador. Las credenciales del CDN cargan solas — no hay `npm install`.

## Setup inicial si se clona fresh

1. Crear `js/supabase-client.js` con el cliente (helpers + credenciales).
2. Renombrar `gitignore` → `.gitignore` (es deliberado sin punto en este repo, no es un error).
3. Confirmar que `config.js` está ignorado.
4. Ejecutar en Supabase SQL Editor las políticas RLS de DELETE (ver sección arriba).
5. Ejecutar migración: `ALTER TABLE games ADD COLUMN IF NOT EXISTS round TEXT;`
6. Servir el directorio con cualquier static server (`python -m http.server`) o apuntar GitHub Pages.
