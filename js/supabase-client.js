// js/supabase-client.js
// Cliente Supabase compartido + helpers para todo el proyecto

const SUPABASE_URL      = 'https://xsibnjbnkbzwcmfluvrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzaWJuamJua2J6d2NtZmx1dnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Mjg3MzgsImV4cCI6MjA5NzMwNDczOH0.hqHVvg7hO2NZerHAge8nk1vbkMKWWXumtK9nGCRXK-Q';

// Inicializa cliente
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// ───────────────────────────────────────────────────────────
// AUTH
// ───────────────────────────────────────────────────────────

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw error;
  window.location.href = 'login.html';
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// ───────────────────────────────────────────────────────────
// STORAGE
// ───────────────────────────────────────────────────────────

async function uploadTeamLogo(file, teamShortName) {
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = (teamShortName || 'team').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `logos/${safeName}-${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from('team-logos')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;

  const { data } = sb.storage.from('team-logos').getPublicUrl(path);
  return data.publicUrl;
}

// ───────────────────────────────────────────────────────────
// RPC (funciones SQL)
// ───────────────────────────────────────────────────────────

async function recordGameEvent(gameId, eventType, playerId, teamId, clockSeconds, notes, period = null) {
  const { data, error } = await sb.rpc('record_game_event', {
    p_game_id: gameId,
    p_event_type: eventType,
    p_player_id: playerId,
    p_team_id: teamId,
    p_clock_seconds: clockSeconds,
    p_notes: notes,
    p_period: period,
  });
  if (error) throw error;
  return data;
}

async function undoLastEvent(gameId) {
  const { data, error } = await sb.rpc('undo_last_event', { p_game_id: gameId });
  if (error) throw error;
  return data;
}

// ───────────────────────────────────────────────────────────
// TOURNAMENT
// ───────────────────────────────────────────────────────────

let _tournamentCache = null;

async function loadActiveTournament(forceReload = false) {
  if (_tournamentCache && !forceReload) return _tournamentCache;
  const { data, error } = await sb
    .from('tournaments')
    .select('id, name, season, period_duration_minutes, ot_duration_minutes, foul_limit_per_player')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  // Fallback defensivo si no hay fila activa
  _tournamentCache = data || {
    id: null,
    name: null,
    season: null,
    period_duration_minutes: 10,
    ot_duration_minutes: 5,
    foul_limit_per_player: 5,
  };
  return _tournamentCache;
}

function invalidateTournamentCache() {
  _tournamentCache = null;
}

// ───────────────────────────────────────────────────────────
// REALTIME
// ───────────────────────────────────────────────────────────

function subscribeToTable(table, filter, callback) {
  const channel = sb
    .channel(`public:${table}:${filter || 'all'}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter },
      callback
    )
    .subscribe();
  return channel;
}

// Exponer en window para los HTML
Object.assign(window, {
  sb,
  getSession,
  signIn,
  signOut,
  requireAuth,
  getCurrentUser,
  uploadTeamLogo,
  recordGameEvent,
  undoLastEvent,
  loadActiveTournament,
  invalidateTournamentCache,
  subscribeToTable,
});
