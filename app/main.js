// Routage, mise en page, accueil et tableau de bord d'une matière.
(() => {
  'use strict';
  const { esc, pct, plural, $, store, summarize, resetSubject, subjectById, annaleQuestions, trainQuestions, tagsOf, views } = App;
  const root = document.getElementById('app');

  // ---------- Cycle de vie des vues ----------
  let cleanups = [];
  App.onLeave = fn => cleanups.push(fn);
  App.onKey = fn => { document.onkeydown = e => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return; fn(e); }; };
  App.go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
  App.refresh = () => render({ keepScroll: true });

  // ---------- Mise en page ----------
  const tabsFor = subject => {
    const hasAnnales = subject.sessions.some(s => s.questionCount);
    return [
      ['home', 'Vue d’ensemble', ''],
      subject.parcours && ['parcours', 'Parcours guidé', '/parcours'],
      (subject.sessions.some(s => s.questionCount && !s.mock) || subject.priorites) && ['prio', 'Priorités', '/prio'],
      subject.qcm.length && ['qcm', 'QCM', '/qcm'],
      (trainQuestions(subject).length || subject.sessions.some(s => s.qcm)) && ['train', 'Entraînement', '/train'],
      subject.sessions.length && ['annales', 'Annales', '/annales'],
      hasAnnales && ['exam', 'Examen blanc', '/exam'],
      subject.fiches.length && ['fiches', 'Fiches', '/fiches'],
      subject.cours.length && ['cours', 'Cours', '/cours'],
    ].filter(Boolean);
  };

  function setTopbar(subject) {
    document.getElementById('subject-nav').innerHTML = App.SUBJECTS.map(s =>
      `<a href="#/s/${s.id}" class="${subject && s.id === subject.id ? 'active' : ''}" title="${esc(s.name)}">
         <span>${esc(s.icon)}</span><span class="nav-label">${esc(s.code || s.name)}</span></a>`).join('');
  }

  // Monte une vue dans le gabarit d'une matière (en-tête + onglets).
  App.mount = (subject, tab, html, { wide = false } = {}) => {
    setTopbar(subject);
    document.title = `${subject.code ? subject.code + ' · ' : ''}${subject.name} — Révisions`;
    root.className = wide ? 'wide' : '';
    root.innerHTML = `
      <header class="subject-head">
        <div class="subject-title">
          <span class="subject-icon">${esc(subject.icon)}</span>
          <div>
            ${subject.code ? `<span class="code-chip">${esc(subject.code)}</span>` : ''}
            <h1>${esc(subject.name)}</h1>
          </div>
        </div>
        <nav class="tabs">${tabsFor(subject).map(([id, label, path]) =>
          `<a href="#/s/${subject.id}${path}" class="${id === tab ? 'active' : ''}">${label}</a>`).join('')}</nav>
      </header>
      <section class="view">${html}</section>`;
    return root.querySelector('.view');
  };
  // Vue hors matière (accueil, recherche globale).
  App.mountPlain = (html, title = 'Révisions') => {
    setTopbar(null);
    document.title = title;
    root.className = '';
    root.innerHTML = html;
    return root;
  };

  // ---------- Routeur ----------
  function parseHash() {
    const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query) };
  }

  function render({ keepScroll = false } = {}) {
    cleanups.forEach(fn => fn());
    cleanups = [];
    document.onkeydown = null;
    const y = window.scrollY;

    const { parts, params } = parseHash();
    const search = $('#global-search');
    if (search && document.activeElement !== search) search.value = parts[0] === 'search' ? params.get('q') || '' : '';

    if (parts[0] === 'search') views.search.render({ params });
    else {
      const subject = parts[0] === 's' && subjectById(parts[1]);
      if (!subject) renderHome();
      else {
        const ctx = { subject, parts: parts.slice(3), params };
        const view = parts[2] || 'home';
        const fn = view === 'home' ? renderSubject : views[view]?.render;
        (fn || renderSubject)(ctx);
      }
    }
    window.scrollTo(0, keepScroll ? y : 0);
  }
  window.addEventListener('hashchange', () => render());

  // ---------- Accueil ----------
  function subjectProgress(subject) {
    const q = summarize(subject, 'qcm', subject.qcm.map(q => q.id));
    const a = summarize(subject, 'annale', annaleQuestions(subject).map(x => x.q.id));
    return { total: q.total + a.total, mastered: q.mastered + a.mastered, seen: q.seen + a.seen };
  }

  function renderHome() {
    const SUBJECTS = App.SUBJECTS;
    if (!SUBJECTS.length) {
      App.mountPlain(`<div class="empty">Aucune matière trouvée. Lance <kbd>node build.js</kbd> pour générer <code>data/subjects.js</code>.</div>`);
      return;
    }
    const view = App.mountPlain(`
      <section class="home-hero">
        <h1>Mes révisions</h1>
        <p class="muted">${plural(SUBJECTS.length, 'matière')} · QCM, annales, examens blancs, fiches et cours.</p>
      </section>
      <div class="grid subjects">
        ${SUBJECTS.map(s => {
          const p = subjectProgress(s);
          const nA = annaleQuestions(s).filter(x => !x.session.mock).length;
          const chips = [
            s.qcm.length && `${s.qcm.length} QCM`,
            nA && `${nA} questions d’annales`,
            s.fiches.length && plural(s.fiches.length, 'fiche'),
            s.cours.length && plural(s.cours.length, 'cours', 'cours'),
          ].filter(Boolean);
          return `
          <a class="card subject-card" href="#/s/${s.id}">
            <div class="row">
              <span class="subject-icon">${esc(s.icon)}</span>
              ${s.code ? `<span class="code-chip">${esc(s.code)}</span>` : ''}
            </div>
            <h2>${esc(s.name)}</h2>
            <p class="muted small">${esc(s.description)}</p>
            <div class="chips-static">${chips.map(c => `<span>${c}</span>`).join('')}</div>
            <div class="progress-line">
              <div class="bar"><i style="width:${pct(p.mastered, p.total)}%"></i></div>
              <span class="small muted">${pct(p.mastered, p.total)} %</span>
            </div>
          </a>`;
        }).join('')}
      </div>
      <section class="card backup">
        <div>
          <h3>Ma progression</h3>
          <p class="muted small">Elle est enregistrée dans ce navigateur uniquement. Sauvegarde-la dans un fichier pour la retrouver sur un autre appareil ou navigateur.</p>
        </div>
        <div class="row wrap">
          <button class="btn small" id="export">⬇ Sauvegarder</button>
          <label class="btn small">⬆ Restaurer<input type="file" id="import" accept="application/json,.json" hidden></label>
        </div>
        <p class="small" id="backup-msg" hidden></p>
      </section>`);

    const msg = t => { const m = $('#backup-msg', view); m.textContent = t; m.hidden = false; };
    $('#export', view).onclick = () => {
      const blob = new Blob([JSON.stringify(App.exportProgress(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `revisions-progression-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $('#import', view).onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        App.importProgress(JSON.parse(await file.text()));
        msg('✓ Progression restaurée.');
        setTimeout(() => App.refresh(), 600);
      } catch (err) {
        msg(`✗ ${err.message}`);
      }
    };
  }

  // ---------- Tableau de bord d'une matière ----------
  function progressRows(rows) {
    return rows.map(r => `
      <div class="prog-row">
        ${r.href ? `<a href="${r.href}">${esc(r.label)}</a>` : `<span>${esc(r.label)}</span>`}
        <div class="bar" title="${r.s.mastered}/${r.s.total} maîtrisées"><i style="width:${pct(r.s.mastered, r.s.total)}%"></i></div>
        <div class="num">${r.s.total ? `${r.s.mastered}/${r.s.total}` : '—'}</div>
      </div>`).join('');
  }

  function renderSubject({ subject }) {
    const annales = annaleQuestions(subject);
    const qcmSum = summarize(subject, 'qcm', subject.qcm.map(q => q.id));
    const annSum = summarize(subject, 'annale', annales.map(x => x.q.id));
    const realAnnales = annales.some(x => !x.session.mock);
    const trainQs = trainQuestions(subject);
    const trainSum = summarize(subject, 'annale', trainQs.map(x => x.q.id));
    const annaleQcm = subject.sessions.reduce((n, s) => n + (s.qcm ? s.qcm.ids.length : 0), 0);
    const exams = store.get(`revisions.exams.${subject.id}`, []);
    const best = exams.length ? Math.max(...exams.map(e => (20 * e.score) / e.total)) : null;
    const withQs = subject.sessions.filter(s => s.questionCount);
    const synth = subject.fiches.filter(f => f.type === 'md').length;

    const pst = App.parcoursStats(subject);
    const actions = [
      pst && {
        href: '/parcours', emoji: '🪜', title: 'Parcours guidé',
        text: `Réviser pas à pas depuis zéro : ${pst.steps} étapes, ${pst.total} exercices (${pst.done} réussis).`,
      },
      (annales.some(x => !x.session.mock) || subject.priorites) && {
        href: '/prio', emoji: '🎯', title: 'Ce qui tombe le plus',
        text: subject.priorites ? `${subject.priorites.items.length} priorités classées, avec fiche, QCM ciblé et questions d’annales.` : `Les thèmes classés selon leur fréquence aux annales.`,
      },
      subject.qcm.length && {
        href: '/qcm?mode=smart', emoji: '⚡', title: 'Révision intelligente',
        text: `Tes erreurs d’abord, puis les questions jamais vues, puis les plus anciennes.`,
      },
      subject.qcm.length && {
        href: '/qcm', emoji: '🎲', title: 'Quiz QCM',
        text: `${subject.qcm.length} questions, tous thèmes mélangés ou au choix.`,
      },
      (trainQs.length || annaleQcm) && {
        href: '/train', emoji: '🧠', title: 'Entraînement annales',
        text: trainQs.length ? `${trainQs.length} questions ouvertes au hasard${annaleQcm ? ` + ${annaleQcm} QCM` : ''}, corrigé et auto-évaluation.`
          : `${annaleQcm} questions des annales QCM au hasard, correction immédiate.`,
      },
      trainQs.length && trainSum.wrong && {
        href: '/train?mode=errors', emoji: '🔁', title: 'Revoir mes « À revoir »',
        text: `${plural(trainSum.wrong, 'question marquée', 'questions marquées')} à revoir.`,
      },
      withQs.length && {
        href: '/exam', emoji: '⏱️', title: 'Examen blanc',
        text: `Un sujet complet chronométré, puis noté sur le barème.`,
      },
      subject.sessions.length && {
        href: '/annales', emoji: '🗂️', title: 'Annales',
        text: (n => `${n ? `${plural(n, 'session')} d’annales` : ''}${n && n < subject.sessions.length ? ' + ' : ''}${n < subject.sessions.length ? plural(subject.sessions.length - n, 'sujet d’entraînement', 'sujets d’entraînement') : ''} : sujets, corrigés, recherche par thème.`)(subject.sessions.filter(x => !x.mock).length),
      },
      subject.fiches.length && {
        href: '/fiches', emoji: '📝', title: 'Fiches',
        text: `${synth ? `${synth} synthèses` : ''}${synth && subject.fiches.length > synth ? ' + ' : ''}${subject.fiches.length > synth ? `${subject.fiches.length - synth} fiches PDF` : ''}.`,
      },
      subject.cours.length && {
        href: '/cours', emoji: '📚', title: 'Cours',
        text: `${plural(subject.cours.length, 'support', 'supports')} de cours, avec recherche dans le texte.`,
      },
    ].filter(Boolean);

    const statsHtml = [
      subject.qcm.length && `<div class="stat"><b>${qcmSum.seen}/${qcmSum.total}</b><span>QCM vus</span></div>`,
      subject.qcm.length && `<div class="stat"><b>${pct(qcmSum.mastered, qcmSum.total)} %</b><span>QCM maîtrisés</span></div>`,
      annales.length && `<div class="stat"><b>${pct(annSum.mastered, annSum.total)} %</b><span>${realAnnales ? 'annales maîtrisées' : 'questions ouvertes maîtrisées'}</span></div>`,
      withQs.length && `<div class="stat"><b>${best == null ? '—' : best.toFixed(1).replace('.', ',') + '/20'}</b><span>meilleur examen blanc</span></div>`,
    ].filter(Boolean).join('');

    let progress = '';
    if (subject.qcm.length) {
      const sets = [...new Set(subject.qcm.map(q => q.set))];
      progress += `<h2>Progression QCM</h2><div class="card">${sets.map(set => {
        const groups = [...new Set(subject.qcm.filter(q => q.set === set).map(q => q.group))];
        return `${sets.length > 1 ? `<div class="prog-set">${esc(set)}</div>` : ''}${progressRows(groups.map(g => {
          const qs = subject.qcm.filter(q => q.set === set && q.group === g);
          return {
            label: App.qcmGroupLabel(subject, qs[0]),
            href: `#/s/${subject.id}/qcm?groups=${encodeURIComponent(`${set}::${g}`)}`,
            s: summarize(subject, 'qcm', qs.map(q => q.id)),
          };
        }))}`;
      }).join('')}</div>`;
    }
    if (trainQs.length) {
      progress += `<h2>Progression ${realAnnales ? 'annales' : 'questions ouvertes'} par thème</h2><div class="card">${progressRows(tagsOf(subject).map(({ tag }) => ({
        label: tag,
        href: `#/s/${subject.id}/train?tags=${encodeURIComponent(tag)}`,
        s: summarize(subject, 'annale', annales.filter(x => x.q.tags.includes(tag)).map(x => x.q.id)),
      })))}</div>`;
    }

    const view = App.mount(subject, 'home', `
      ${subject.description ? `<p class="muted lead">${esc(subject.description)}</p>` : ''}
      ${statsHtml ? `<div class="stats">${statsHtml}</div>` : ''}
      <div class="actions">
        ${actions.map(a => `
          <a class="card action" href="#/s/${subject.id}${a.href}">
            <div class="emoji">${a.emoji}</div><h3>${a.title}</h3><p class="muted small">${a.text}</p>
          </a>`).join('')}
      </div>
      ${progress}
      <div class="danger-zone"><button class="btn ghost small" id="reset">Réinitialiser ma progression sur cette matière</button></div>`);

    const reset = $('#reset', view);
    reset.onclick = () => {
      if (!reset.dataset.armed) { reset.dataset.armed = '1'; reset.textContent = 'Cliquer à nouveau pour confirmer'; return; }
      resetSubject(subject);
      App.refresh();
    };
  }

  // ---------- Démarrage ----------
  // Appelé par index.html (données locales) ou par boot.js après déchiffrement (version en ligne).
  App.boot = subjects => {
    App.SUBJECTS = subjects || [];
    const search = $('#global-search');
    if (search) {
      search.hidden = false;
      let t;
      search.oninput = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const q = search.value.trim();
          if (q.length >= 2) App.go(`#/search?q=${encodeURIComponent(q)}`);
        }, 250);
      };
      search.onkeydown = e => { if (e.key === 'Enter' && search.value.trim()) App.go(`#/search?q=${encodeURIComponent(search.value.trim())}`); };
    }
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName) && search) { e.preventDefault(); search.focus(); }
    });
    render();
  };
})();
