// Utilitaires partagés : échappement, stockage, statistiques, accès aux fichiers, rendu Markdown.
window.App = (() => {
  'use strict';

  const App = { SUBJECTS: [], views: {} };

  // ---------- Divers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fileUrl = file => file.split('/').map(encodeURIComponent).join('/');
  const plural = (n, one, many = one + 's') => `${n} ${n > 1 ? many : one}`;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // "1h30", "2 heures", "90 min" -> minutes
  function parseDuration(s) {
    if (!s) return null;
    const t = norm(s);
    let m = t.match(/(\d+)\s*h(?:eures?)?\s*(\d+)?/);
    if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
    m = t.match(/(\d+)\s*min/);
    return m ? Number(m[1]) : null;
  }
  const fmtClock = secs => {
    const neg = secs < 0;
    secs = Math.abs(Math.round(secs));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return `${neg ? '+' : ''}${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  };
  const fmtDate = ts => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  // ---------- Stockage ----------
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
    del(key) { try { localStorage.removeItem(key); } catch {} },
  };

  // Stats par question. QCM : last = 0|1. Annales (auto-évaluation) : last = 0 | 0.5 | 1.
  const STATS_KEY = 'revisions.stats.v1';
  let stats = store.get(STATS_KEY, {});
  const statKey = (subject, kind, id) => (kind === 'qcm' ? `${subject.id}:${id}` : `${subject.id}:a:${id}`);
  const stat = (subject, kind, id) => stats[statKey(subject, kind, id)];
  function record(subject, kind, id, value) {
    const k = statKey(subject, kind, id);
    const s = stats[k] || { seen: 0, correct: 0, last: null };
    s.seen++;
    s.correct += value;
    s.last = value;
    s.at = Date.now();
    stats[k] = s;
    store.set(STATS_KEY, stats);
  }
  // Corrige la dernière évaluation enregistrée (l'utilisateur change d'avis).
  function amend(subject, kind, id, value) {
    const s = stats[statKey(subject, kind, id)];
    if (!s) return record(subject, kind, id, value);
    s.correct += value - s.last;
    s.last = value;
    store.set(STATS_KEY, stats);
  }
  function summarize(subject, kind, ids) {
    let seen = 0, mastered = 0, wrong = 0;
    for (const id of ids) {
      const s = stat(subject, kind, id);
      if (!s) continue;
      seen++;
      if (s.last === 1) mastered++;
      else if (s.last === 0) wrong++;
    }
    return { total: ids.length, seen, mastered, wrong };
  }
  function resetSubject(subject) {
    for (const k of Object.keys(stats)) if (k.startsWith(subject.id + ':')) delete stats[k];
    store.set(STATS_KEY, stats);
    store.del(`revisions.exams.${subject.id}`);
  }

  // Sauvegarde / restauration de toute la progression (fichier JSON).
  function exportProgress() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('revisions.') && k !== 'revisions.auth') data[k] = localStorage.getItem(k);
    }
    return { app: 'revisions', version: 1, exportedAt: new Date().toISOString(), data };
  }
  function importProgress(json) {
    if (json?.app !== 'revisions' || !json.data) throw new Error('Fichier de progression invalide');
    for (const [k, v] of Object.entries(json.data)) if (k.startsWith('revisions.')) localStorage.setItem(k, v);
    stats = store.get(STATS_KEY, {});
  }

  // ---------- Accès aux fichiers (PDF, images) ----------
  // En local : simple URL relative. En ligne (mode chiffré), boot.js remplace App.assetUrl
  // par une fonction qui télécharge et déchiffre le fichier, puis renvoie une URL blob.
  App.assetUrl = async path => fileUrl(path);
  // Sujets hors annales (entrainements/*.json) regroupés par section : [{ title, intro, sessions }].
  App.mockSections = (mocks, intro) => {
    const map = new Map();
    for (const s of mocks) {
      const title = s.section || 'Sujets d’entraînement inédits';
      if (!map.has(title)) map.set(title, { title, intro: s.sectionIntro || intro, sessions: [] });
      map.get(title).sessions.push(s);
    }
    return [...map.values()];
  };
  App.loadSearch = () => new Promise((resolve, reject) => {
    if (window.SEARCH_PAGES) return resolve(window.SEARCH_PAGES);
    const s = document.createElement('script');
    s.src = 'data/search.js';
    s.onload = () => resolve(window.SEARCH_PAGES || {});
    s.onerror = () => reject(new Error('Index de recherche introuvable'));
    document.head.appendChild(s);
  });
  const withPage = (url, page) => (page ? `${url}#page=${page}` : url);
  const assetAttrs = (path, page) => `data-asset="${esc(path)}"${page ? ` data-page="${page}"` : ''}`;

  // Renseigne src/href des éléments [data-asset] (appelé automatiquement à chaque ajout dans la page).
  async function hydrate(root) {
    const els = root.matches?.('[data-asset]') ? [root] : [];
    els.push(...(root.querySelectorAll ? root.querySelectorAll('[data-asset]:not([data-ready])') : []));
    for (const el of els) {
      el.dataset.ready = '1';
      try {
        const url = withPage(await App.assetUrl(el.dataset.asset), el.dataset.page);
        if (el.tagName === 'A') el.href = url;
        else el.src = url;
      } catch (e) {
        el.classList.add('asset-error');
        el.title = 'Fichier indisponible';
      }
    }
  }
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && hydrate(n))))
    .observe(document.documentElement, { childList: true, subtree: true });

  // ---------- Accès aux données ----------
  const subjectById = id => App.SUBJECTS.find(s => s.id === id);
  const annaleQuestions = subject => subject.sessions.flatMap(s =>
    s.dossiers.flatMap(d => d.questions.map(q => ({ q, session: s, dossier: d }))));
  // Questions de l'onglet Entraînement : sessions avec "train": false exclues (ex. cas pratique du cours).
  const trainQuestions = subject => annaleQuestions(subject).filter(x => x.session.train !== false);
  const tagsOf = subject => {
    const count = {};
    annaleQuestions(subject).forEach(({ q }) => q.tags.forEach(t => (count[t] = (count[t] || 0) + 1)));
    return Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => ({ tag: t, count: n }));
  };
  const qcmGroupLabel = (subject, q) => {
    if (typeof q.fiche !== 'number') return q.group;
    const f = subject.fiches.find(f => f.type === 'pdf' && f.num === q.fiche);
    return f ? `Fiche ${q.fiche} — ${f.title}` : `Fiche ${q.fiche}`;
  };
  // Titre lisible d'un PDF à partir de son chemin.
  function pdfTitle(path) {
    for (const s of App.SUBJECTS) {
      const c = s.cours.find(c => c.file === path);
      if (c) return c.title;
      const f = s.fiches.find(f => f.file === path);
      if (f) return `Fiche ${f.num ?? ''} — ${f.title}`;
      const x = s.sessions.find(x => x.sujet === path || x.corrige === path);
      if (x) return `${x.sujet === path ? 'Sujet' : 'Corrigé'} ${x.label}`;
    }
    return path.split('/').pop().replace(/\.pdf$/i, '');
  }
  // Lien vers la visionneuse intégrée, dans la matière courante si elle contient ce PDF.
  function pdfRoute(path, page, preferSubject) {
    preferSubject ||= subjectById((location.hash.match(/^#\/s\/([^/?]+)/) || [])[1]);
    const owner = (preferSubject && hasPdf(preferSubject, path)) ? preferSubject : App.SUBJECTS.find(s => hasPdf(s, path)) || preferSubject;
    return `#/s/${owner?.id}/cours/view?f=${encodeURIComponent(path)}${page ? `&p=${page}` : ''}`;
  }
  const hasPdf = (s, path) => s.cours.some(c => c.file === path) || s.fiches.some(f => f.file === path) ||
    s.sessions.some(x => x.sujet === path || x.corrige === path);

  // ---------- Markdown (sous-ensemble) ----------
  const PDF_REF = /\b((?:cours|fiches|annales)\/[^<>\n|]*?\.pdf)(?:,?\s*(?:p\.|pages?)\s*(\d+)(?:\s*[–-]\s*\d+)?)?/g;
  function inline(text, base) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img ${srcAttrs(src, base, 'src')} alt="${alt}" loading="lazy">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a ${srcAttrs(href, base, 'href')} target="_blank" rel="noopener">${t}</a>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(«])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?»]|$)/g, '$1<em>$2</em>');
    if (base) s = s.replace(PDF_REF, (m, file, page) => `<a class="pdf-ref" href="${pdfRoute(`${base}/${file.replace(/&amp;/g, '&').replace(/&#39;/g, "'")}`, page)}">📖 ${m}</a>`);
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }
  function srcAttrs(src, base, attr) {
    const raw = src.replace(/&amp;/g, '&');
    if (/^(https?:|data:|#|\/)/.test(raw) || !base) return `${attr}="${esc(raw)}"`;
    return assetAttrs(`${base}/${raw}`);
  }

  function markdown(src, base = '') {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    const isTableSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

    while (i < lines.length) {
      const line = lines[i];

      const fence = line.match(/^\s*```\s*([\w+-]*)/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre class="code"${fence[1] ? ` data-lang="${esc(fence[1])}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }

      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { const lvl = Math.min(h[1].length + 2, 6); out.push(`<h${lvl}>${inline(h[2], base)}</h${lvl}>`); i++; continue; }

      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c, base)}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c, base)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${markdown(buf.join('\n'), base)}</blockquote>`);
        continue;
      }

      if (listRe.test(line)) {
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(listRe);
          if (m) { items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3] }); i++; continue; }
          if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length && !/^\s*```/.test(lines[i])) {
            items[items.length - 1].text += '\n' + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        out.push(buildList(items, base));
        continue;
      }

      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) &&
        !listRe.test(lines[i]) && !(lines[i].trim().startsWith('|') && isTableSep(lines[i + 1] || '')) && !/^\s*>/.test(lines[i])) {
        buf.push(lines[i++]);
      }
      out.push(`<p>${buf.map(l => inline(l.trim(), base)).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  function buildList(items, base) {
    let html = '';
    const stack = [];
    for (const it of items) {
      while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
      const top = stack[stack.length - 1];
      if (!top || it.indent > top.indent) {
        const tag = it.ordered ? 'ol' : 'ul';
        stack.push({ indent: it.indent, tag });
        html += `<${tag}><li>`;
      } else {
        html += '</li><li>';
      }
      html += it.text.split('\n').map(l => inline(l, base)).join('<br>');
    }
    while (stack.length) html += `</li></${stack.pop().tag}>`;
    return html;
  }

  // Extrait autour du terme recherché, avec surlignage.
  function snippet(text, terms, len = 180) {
    const n = norm(text);
    let pos = -1;
    for (const t of terms) { pos = n.indexOf(t); if (pos >= 0) break; }
    const start = Math.max(0, pos - len / 3);
    let s = esc(text.slice(start, start + len).replace(/\s+/g, ' '));
    for (const t of terms) {
      if (!t) continue;
      // Surlignage insensible aux accents : on cherche sur la version normalisée.
      const ns = norm(s);
      let out = '', last = 0, idx;
      while ((idx = ns.indexOf(t, last)) >= 0) {
        out += s.slice(last, idx) + '<mark>' + s.slice(idx, idx + t.length) + '</mark>';
        last = idx + t.length;
      }
      s = out + s.slice(last);
      break;
    }
    return (start > 0 ? '…' : '') + s + '…';
  }

  return Object.assign(App, {
    esc, shuffle, pct, norm, fileUrl, plural, $, $$, parseDuration, fmtClock, fmtDate,
    store, stat, record, amend, summarize, resetSubject, exportProgress, importProgress,
    assetAttrs, hydrate, subjectById, annaleQuestions, trainQuestions, tagsOf, qcmGroupLabel, pdfTitle, pdfRoute, hasPdf,
    markdown, snippet,
  });
})();
