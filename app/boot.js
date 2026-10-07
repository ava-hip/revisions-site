// Version en ligne : écran de connexion, déchiffrement des données et des fichiers (AES-256-GCM).
// La clé est dérivée de « identifiant:mot de passe » (PBKDF2-SHA256). Sans elle, les fichiers publiés sont illisibles.
(() => {
  'use strict';
  const { $, esc, store } = App;
  const AUTH_KEY = 'revisions.auth';
  const root = document.getElementById('app');
  const enc = new TextEncoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' };

  let meta, key, assets = {};

  async function deriveBits(id, password) {
    const base = await crypto.subtle.importKey('raw', enc.encode(`${id.trim().toLowerCase()}:${password}`), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(meta.salt), iterations: meta.iterations }, base, 256);
  }
  const importKey = bits => crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);

  async function fetchDecrypt(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} : ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  }
  const fetchJson = async url => JSON.parse(new TextDecoder().decode(await fetchDecrypt(url)));

  // Essaie une clé : renvoie les données si elle déchiffre bien subjects.bin.
  async function unlock(bits) {
    key = await importKey(bits);
    return fetchJson('data/subjects.bin');
  }

  function start(data) {
    assets = data.assets;
    const cache = new Map();
    App.assetUrl = path => {
      if (!cache.has(path)) {
        const id = assets[path];
        if (!id) return Promise.reject(new Error('Fichier inconnu : ' + path));
        const ext = path.split('.').pop().toLowerCase();
        cache.set(path, fetchDecrypt(`f/${id}.bin`).then(buf => URL.createObjectURL(new Blob([buf], { type: MIME[ext] || 'application/octet-stream' }))));
      }
      return cache.get(path);
    };
    let search;
    App.loadSearch = () => (search ||= fetchJson('data/search.bin'));

    const logout = document.createElement('button');
    logout.className = 'btn ghost small logout';
    logout.textContent = 'Déconnexion';
    logout.onclick = () => { store.del(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); location.reload(); };
    document.querySelector('.topbar').appendChild(logout);
    App.boot(data.subjects);
  }

  function showLogin(error = '') {
    root.innerHTML = `
      <div class="card login">
        <div style="font-size:40px">📚</div>
        <h1>Révisions</h1>
        <form id="login">
          <input type="text" id="id" placeholder="Identifiant" autocomplete="username" required>
          <input type="password" id="pwd" placeholder="Mot de passe" autocomplete="current-password" required>
          <label class="remember"><input type="checkbox" id="remember" checked> Rester connecté sur cet appareil</label>
          <button class="btn primary" type="submit" id="go">Se connecter</button>
          <p class="error" id="err">${esc(error)}</p>
        </form>
      </div>`;
    $('#id').focus();
    $('#login').onsubmit = async e => {
      e.preventDefault();
      const go = $('#go');
      go.disabled = true;
      go.textContent = 'Déchiffrement…';
      $('#err').textContent = '';
      try {
        const bits = await deriveBits($('#id').value, $('#pwd').value);
        const data = await unlock(bits);
        if ($('#remember').checked) store.set(AUTH_KEY, b64(bits));
        else sessionStorage.setItem(AUTH_KEY, JSON.stringify(b64(bits)));
        start(data);
      } catch (err) {
        go.disabled = false;
        go.textContent = 'Se connecter';
        $('#err').textContent = err.name === 'OperationError' ? 'Identifiant ou mot de passe incorrect.' : `Erreur : ${err.message}`;
      }
    };
  }

  (async () => {
    if (!window.crypto?.subtle) {
      root.innerHTML = '<div class="empty">Ce navigateur ne permet pas le déchiffrement (il faut une page en https).</div>';
      return;
    }
    try {
      meta = await fetch('data/meta.json').then(r => r.json());
    } catch {
      root.innerHTML = '<div class="empty">Impossible de charger l’application.</div>';
      return;
    }
    let saved = store.get(AUTH_KEY, null);
    try { saved ||= JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch {}
    if (saved) {
      try { return start(await unlock(unb64(saved))); } catch { store.del(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); }
    }
    showLogin();
  })();
})();
