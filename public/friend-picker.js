/**
 * friend-picker.js — Ranchadapp
 *
 * Muestra los amigos registrados del usuario en la pantalla de configuración
 * de cada juego para pre-cargar jugadores y registrar quién jugó.
 *
 * Requiere: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 *
 * Uso en cada HTML:
 *   FriendPicker.init({
 *     zoneId:         'fp-zone',          // div donde se renderiza
 *     addPlayerFn:    addPlayer,           // función del juego (acepta nombre opcional)
 *     getPlayerNames: getPlayerNames,      // función que devuelve array de nombres actuales
 *     gameType:       'impostor'           // para guardar en game_sessions
 *   });
 *
 * SQL requerido en Supabase:
 * ─────────────────────────────────────────────────────────────────
 *   create table game_sessions (
 *     id          uuid default gen_random_uuid() primary key,
 *     game_type   text not null,
 *     host_id     uuid references profiles(id) on delete set null,
 *     created_at  timestamp with time zone default now()
 *   );
 *
 *   create table game_session_players (
 *     session_id  uuid references game_sessions(id) on delete cascade,
 *     user_id     uuid references profiles(id) on delete set null,
 *     guest_name  text,
 *     primary key (session_id, coalesce(user_id::text, guest_name))
 *   );
 *
 *   -- RLS
 *   alter table game_sessions enable row level security;
 *   alter table game_session_players enable row level security;
 *
 *   create policy "insert propio" on game_sessions
 *     for insert with check (auth.uid() = host_id);
 *   create policy "select propio" on game_sessions
 *     for select using (auth.uid() = host_id);
 *
 *   create policy "insert sesión propia" on game_session_players
 *     for insert with check (
 *       exists (
 *         select 1 from game_sessions
 *         where id = session_id and host_id = auth.uid()
 *       )
 *     );
 *   create policy "select jugador" on game_session_players
 *     for select using (
 *       user_id = auth.uid() or
 *       exists (
 *         select 1 from game_sessions
 *         where id = session_id and host_id = auth.uid()
 *       )
 *     );
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'ranchadapp_session';

  let _client = null;
  let _session = null;
  let _friends = [];          // [{ id, nombre_display, username }]
  let _addedFriendIds = new Set();
  let _config = null;

  // ─── API pública ─────────────────────────────────────────────────────────────

  const FriendPicker = {

    /**
     * Inicializa el picker. Llama a esto cuando el setup screen esté en el DOM.
     * @param {Object} config
     * @param {string}   config.zoneId         - ID del div contenedor del picker
     * @param {Function} config.addPlayerFn     - función del juego que agrega un jugador (acepta nombre)
     * @param {Function} config.getPlayerNames  - función que devuelve array de nombres actuales
     * @param {string}   config.gameType        - 'impostor' | 'berenjena' | 'generala' | 'splitwise'
     */
    async init(config) {
      _config = config;
      _addedFriendIds = new Set();
      _session = _loadSession();
      if (!_session) return;

      // Supabase CDN debe estar cargado antes que este script
      if (typeof supabase === 'undefined') {
        console.warn('FriendPicker: Supabase CDN no está cargado.');
        return;
      }

      try {
        _client = supabase.createClient(_session.supabase_url, _session.anon_key);
        await _client.auth.setSession({
          access_token: _session.access_token,
          refresh_token: _session.refresh_token,
        });

        _friends = await _fetchFriends(_session.user_id);
        if (_friends.length === 0) return;

        _render();
      } catch (err) {
        console.warn('FriendPicker: no se pudo inicializar.', err);
      }
    },

    /**
     * Registra la partida en Supabase (fire & forget — no bloquea el juego).
     * @param {string}   gameType
     * @param {string[]} playerNames - array con todos los nombres de jugadores
     */
    async saveSession(gameType, playerNames) {
      if (!_client || !_session) return;
      try {
        const { data: gs, error } = await _client
          .from('game_sessions')
          .insert({ game_type: gameType, host_id: _session.user_id })
          .select('id')
          .single();

        if (error || !gs) return;

        const rows = playerNames.map(name => {
          const friend = _friends.find(
            f => f.nombre_display.toLowerCase() === name.toLowerCase()
          );
          return friend
            ? { session_id: gs.id, user_id: friend.id, guest_name: null }
            : { session_id: gs.id, user_id: null, guest_name: name };
        });

        await _client.from('game_session_players').insert(rows);
      } catch (err) {
        // Silencioso — el juego no debe romperse si falla el guardado
        console.warn('FriendPicker: no se pudo guardar la sesión.', err);
      }
    },

    /**
     * Resetea el estado (útil al reiniciar una partida sin recargar la página).
     */
    reset() {
      _addedFriendIds = new Set();
      _renderChips();
    },
  };

  // ─── Privadas ─────────────────────────────────────────────────────────────────

  function _loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.access_token || !s.refresh_token || !s.supabase_url || !s.anon_key || !s.user_id) return null;
      return s;
    } catch {
      return null;
    }
  }

  async function _fetchFriends(userId) {
    try {
      const { data, error } = await _client
        .from('friendships')
        .select(`
          requester_id, addressee_id,
          requester:profiles!friendships_requester_id_fkey(id, username, nombre, apellido),
          addressee:profiles!friendships_addressee_id_fkey(id, username, nombre, apellido)
        `)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (error || !data) return [];

      return data
        .map(row => {
          const profile = row.requester_id === userId ? row.addressee : row.requester;
          if (!profile) return null;
          const nombre_display =
            [profile.nombre, profile.apellido].filter(Boolean).join(' ').trim() ||
            profile.username ||
            'Sin nombre';
          return { id: profile.id, nombre_display, username: profile.username };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function _render() {
    const zone = document.getElementById(_config.zoneId);
    if (!zone) return;

    // Limpiar si ya había algo
    const existing = document.getElementById('fp-wrapper');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'fp-wrapper';
    wrapper.style.cssText = 'margin-bottom: 20px;';
    wrapper.innerHTML = `
      <div style="
        font-size: 0.8rem;
        font-weight: 700;
        color: #01050F;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        margin-bottom: 10px;
      ">Tus amigos</div>
      <div id="fp-chips" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
    `;

    zone.appendChild(wrapper);
    _renderChips();
  }

  function _renderChips() {
    const container = document.getElementById('fp-chips');
    if (!container) return;

    container.innerHTML = '';

    _friends.forEach(friend => {
      const isAdded = _addedFriendIds.has(friend.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = isAdded ? `✓ ${friend.nombre_display}` : friend.nombre_display;

      const baseStyle = `
        padding: 7px 14px;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
        font-family: Ubuntu, sans-serif;
        transition: all 0.15s;
        cursor: pointer;
        white-space: nowrap;
      `;

      if (isAdded) {
        chip.style.cssText = baseStyle + `
          border: 1.5px solid #01050F;
          background: #01050F;
          color: #ffffff;
          cursor: default;
        `;
      } else {
        chip.style.cssText = baseStyle + `
          border: 1.5px solid #c8d8ec;
          background: #f3f6fa;
          color: #01050F;
        `;
        chip.onmouseenter = () => {
          chip.style.borderColor = '#01050F';
          chip.style.background = '#edf2f7';
        };
        chip.onmouseleave = () => {
          chip.style.borderColor = '#c8d8ec';
          chip.style.background = '#f3f6fa';
        };
        chip.onclick = () => _addFriend(friend);
      }

      container.appendChild(chip);
    });
  }

  function _addFriend(friend) {
    // No agregar si ya está en la lista de jugadores
    if (_config.getPlayerNames) {
      const currentNames = _config.getPlayerNames().map(n => n.toLowerCase());
      if (currentNames.includes(friend.nombre_display.toLowerCase())) {
        // Parpadeo suave para indicar que ya está
        const chip = Array.from(document.querySelectorAll('#fp-chips button'))
          .find(b => b.textContent === friend.nombre_display);
        if (chip) {
          const originalColor = chip.style.background;
          chip.style.background = '#fef9c3';
          setTimeout(() => { chip.style.background = originalColor; }, 400);
        }
        return;
      }
    }

    _config.addPlayerFn(friend.nombre_display);
    _addedFriendIds.add(friend.id);
    _renderChips();
  }

  window.FriendPicker = FriendPicker;
})();
