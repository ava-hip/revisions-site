// QCM : configuration, déroulement, résultats, banque de questions.
(() => {
  'use strict';
  const { esc, shuffle, pct, norm, plural, $, $$, store, stat, record } = App;
  const LETTERS = 'abcdefghij';
  const SETTINGS_KEY = 'revisions.qcm.settings.v1';
  let quiz = null;

  window.addEventListener('hashchange', () => { if (!/\/qcm(\?|$)/.test(location.hash)) quiz = null; });

  const subnav = (subject, active) => `
    <div class="segmented">
      <a href="#/s/${subject.id}/qcm" class="${active === 'quiz' ? 'active' : ''}">Quiz</a>
      <a href="#/s/${subject.id}/qcm/bank" class="${active === 'bank' ? 'active' : ''}">Banque de questions</a>
    </div>`;
  const groupKey = q => `${q.set}::${q.group}`;
  // [{ set, groups: [{ key, label, count }] }] dans l'ordre d'apparition.
  function groupsOf(subject) {
    const sets = new Map();
    for (const q of subject.qcm) {
      if (!sets.has(q.set)) sets.set(q.set, new Map());
      const g = sets.get(q.set);
      if (!g.has(groupKey(q))) g.set(groupKey(q), { key: groupKey(q), label: typeof q.fiche === 'number' ? `Fiche ${q.fiche}` : q.group, count: 0 });
      g.get(groupKey(q)).count++;
    }
    return [...sets].map(([set, g]) => ({ set, groups: [...g.values()] }));
  }
  const chip = (name, value, label, checked, type = 'radio') =>
    `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  App.chip = chip;

  // Lien vers la source d'une question (page du cours, dans la visionneuse).
  App.sourceLink = (q, label = 'Voir dans le cours') => (q.source
    ? `<a class="source-link" href="${App.pdfRoute(q.source.file, q.source.page)}">📖 ${label} — ${esc(App.pdfTitle(q.source.file))}${q.source.page ? `, p. ${q.source.page}` : ''}</a>`
    : '');

  function render(ctx) {
    const { subject, parts, params } = ctx;
    if (parts[0] === 'bank') return renderBank(ctx);
    if (quiz && quiz.subject === subject) return quiz.done ? renderResults() : renderQuestion();
    renderSetup(subject, params);
  }

  // ---------- Configuration ----------
  function renderSetup(subject, params) {
    const settings = { count: '20', exam: false, shuffleOptions: true, ...store.get(SETTINGS_KEY, {}) };
    const mode = params.get('mode') || 'all';
    const pre = params.get('groups') ? params.get('groups').split('|') : null;
    // Si la matière a des questions officielles, seules celles du programme actuel sont cochées par défaut.
    const hasOfficial = subject.qcm.some(q => q.official);
    const inSet = set => subject.qcm.filter(q => q.set === set);
    const isOfficial = set => inSet(set).every(q => q.official), isLegacy = set => inSet(set).some(q => q.legacy);
    const defaultOn = set => !hasOfficial || (isOfficial(set) && !isLegacy(set));
    const setBadge = set => (!hasOfficial ? ''
      : isOfficial(set) ? `<span class="badge official">officiel</span>${isLegacy(set) ? '<span class="badge warn">ancien programme</span>' : ''}`
      : '<span class="badge warn">non officiel · généré à partir des cours</span>');
    const sets = groupsOf(subject);

    const view = App.mount(subject, 'qcm', `
      ${subnav(subject, 'quiz')}
      <form class="card form" id="setup">
        <fieldset>
          <legend>Thèmes <span class="legend-actions"><a href="#" data-all="1">Tout</a> · <a href="#" data-all="0">Aucun</a></span></legend>
          ${sets.map(({ set, groups }) => `
            <div class="chip-group">
              ${sets.length > 1 ? `<div class="chip-group-title"><span>${esc(set)}</span>${setBadge(set)}
                <span class="legend-actions"><a href="#" data-set="${esc(set)}" data-all="1">tout</a> · <a href="#" data-set="${esc(set)}" data-all="0">aucun</a></span></div>` : ''}
              <div class="chips">${groups.map(g => chip('group', g.key, `${g.label} (${g.count})`, pre ? pre.includes(g.key) : defaultOn(set), 'checkbox')).join('')}</div>
            </div>`).join('')}
        </fieldset>
        <fieldset>
          <legend>Questions</legend>
          <div class="chips">
            ${chip('mode', 'smart', '⚡ Révision intelligente', mode === 'smart')}
            ${chip('mode', 'all', 'Toutes au hasard', mode === 'all')}
            ${chip('mode', 'new', 'Jamais vues', mode === 'new')}
            ${chip('mode', 'errors', 'Mes erreurs', mode === 'errors')}
          </div>
          <p class="muted small hint-line" id="mode-hint"></p>
        </fieldset>
        <fieldset>
          <legend>Nombre de questions</legend>
          <div class="chips">${['10', '20', '40', 'all'].map(c => chip('count', c, c === 'all' ? 'Toutes' : c, settings.count === c)).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>Correction</legend>
          <div class="chips">
            ${chip('exam', '0', 'Après chaque question', !settings.exam)}
            ${chip('exam', '1', 'À la fin (mode examen)', settings.exam)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Options</legend>
          <div class="chips">${chip('shuffleOptions', '1', 'Mélanger l’ordre des réponses', settings.shuffleOptions, 'checkbox')}</div>
        </fieldset>
        <div class="row">
          <button class="btn primary" type="submit" id="start">Commencer</button>
          <span class="muted small" id="avail"></span>
        </div>
      </form>`);

    const form = $('#setup', view);
    const HINTS = {
      smart: 'Priorité aux questions ratées, puis aux jamais vues, puis à celles révisées il y a le plus longtemps.',
      all: 'Tirage au hasard parmi les thèmes cochés.',
      new: 'Uniquement les questions que tu n’as jamais faites.',
      errors: 'Uniquement les questions ratées la dernière fois.',
    };
    const pool = () => {
      const fd = new FormData(form);
      const groups = new Set(fd.getAll('group'));
      const m = fd.get('mode');
      return subject.qcm.filter(q => {
        if (!groups.has(groupKey(q))) return false;
        const s = stat(subject, 'qcm', q.id);
        if (m === 'new') return !s;
        if (m === 'errors') return s && s.last === 0;
        return true;
      });
    };
    const update = () => {
      const n = pool().length;
      $('#avail', view).textContent = plural(n, 'question disponible', 'questions disponibles');
      $('#start', view).disabled = n === 0;
      $('#mode-hint', view).textContent = HINTS[new FormData(form).get('mode')];
    };
    form.addEventListener('change', update);
    $$('[data-all]', view).forEach(a => (a.onclick = e => {
      e.preventDefault();
      const sel = a.dataset.set ? $$('input[name=group]', form).filter(i => i.value.startsWith(a.dataset.set + '::')) : $$('input[name=group]', form);
      sel.forEach(i => (i.checked = a.dataset.all === '1'));
      update();
    }));
    update();

    form.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(form);
      const next = { count: fd.get('count'), exam: fd.get('exam') === '1', shuffleOptions: fd.get('shuffleOptions') === '1' };
      store.set(SETTINGS_KEY, next);
      const n = next.count === 'all' ? Infinity : Number(next.count);
      const picked = fd.get('mode') === 'smart' ? prioritize(subject, pool()).slice(0, n) : shuffle(pool()).slice(0, n);
      start(subject, shuffle(picked), next);
    };
  }

  // Révision intelligente : ratées > jamais vues > réussies (les plus anciennes d'abord).
  function prioritize(subject, list) {
    const rank = q => {
      const s = stat(subject, 'qcm', q.id);
      if (!s) return 1;
      if (s.last === 0) return 0;
      return 2;
    };
    const buckets = [[], [], []];
    shuffle(list).forEach(q => buckets[rank(q)].push(q));
    buckets[2].sort((a, b) => (stat(subject, 'qcm', a.id).at || 0) - (stat(subject, 'qcm', b.id).at || 0));
    return buckets.flat();
  }

  // Ne pas mélanger les réponses qui dépendent de leur position.
  const orderDependent = q => q.options.some(o => /ci-dessus|toutes les propositions|aucune des|les \d propositions/i.test(o))
    || q.options.every(o => /^(vrai|faux)$/i.test(o.trim()));

  function start(subject, questions, settings) {
    const idx = q => q.options.map((_, i) => i);
    quiz = {
      subject, settings, index: 0, done: false,
      items: questions.map(q => ({ q, order: settings.shuffleOptions && !orderDependent(q) ? shuffle(idx(q)) : idx(q), chosen: null, revealed: false })),
    };
    App.go(`#/s/${subject.id}/qcm`);
  }
  App.startQcmWith = start;

  // Épreuve QCM d'annale : toutes les questions dans l'ordre du sujet, correction à la fin, note sur 20.
  App.startAnnaleQcm = (subject, session) => {
    const qs = session.qcm.ids.map(id => subject.qcm.find(q => q.id === id)).filter(Boolean);
    start(subject, qs, { exam: true, shuffleOptions: false, session: session.id });
  };

  const feedbackHtml = (q, ok) => `
    <div class="feedback-box ${ok ? 'good' : 'bad'}">
      <div class="feedback">${ok ? '✓ Bonne réponse' : `✗ Mauvaise réponse — la bonne réponse était : ${inlineCode(q.options[q.correct])}`}</div>
      ${q.explain ? `<p class="explain">${inlineCode(q.explain)}</p>` : ''}
      ${App.sourceLink(q)}
    </div>`;

  // ---------- Déroulement ----------
  function renderQuestion() {
    const { subject, items, settings } = quiz;
    const item = items[quiz.index];
    const { q, order } = item;
    const isLast = quiz.index === items.length - 1;
    const canNext = settings.exam ? item.chosen != null : item.revealed;
    const done = settings.exam ? items.filter(i => i.chosen != null).length : quiz.index + (item.revealed ? 1 : 0);
    const pdfFiche = typeof q.fiche === 'number' && subject.fiches.find(f => f.id === `pdf-${q.fiche}`);

    const options = order.map((orig, pos) => {
      let cls = 'option';
      if (item.revealed) cls += orig === q.correct ? ' correct' : orig === item.chosen ? ' wrong' : '';
      else if (orig === item.chosen) cls += ' selected';
      return `<button class="${cls}" data-idx="${orig}" ${item.revealed ? 'disabled' : ''}>
        <span class="key">${LETTERS[pos].toUpperCase()}</span><span>${inlineCode(q.options[orig])}</span></button>`;
    }).join('');

    const view = App.mount(subject, 'qcm', `
      <div class="progress">
        <span class="num">${quiz.index + 1} / ${items.length}</span>
        <div class="bar"><i style="width:${pct(done, items.length)}%"></i></div>
        <button class="btn ghost small" id="quit">Abandonner</button>
      </div>
      <div class="card quiz-card">
        <div class="qmeta">
          ${pdfFiche ? `<a class="tag" href="#/s/${subject.id}/fiches/${pdfFiche.id}">${esc(App.qcmGroupLabel(subject, q))}</a>`
                     : `<span class="tag">${esc(App.qcmGroupLabel(subject, q))}</span>`}
          ${!q.official ? `<span class="tag theme">${esc(q.set)}</span>` : ''}
          ${!q.official && subject.qcm.some(x => x.official) ? '<span class="tag warn-tag">non officielle</span>' : ''}
          ${q.legacy ? '<span class="tag warn-tag">ancien programme</span>' : ''}
        </div>
        <div class="question">${inlineCode(q.text)}</div>
        <div class="options">${options}</div>
        ${item.revealed ? feedbackHtml(q, item.chosen === q.correct) : ''}
        <div class="row actions-row">
          ${settings.exam && quiz.index > 0 ? `<button class="btn" id="prev">← Précédent</button>` : ''}
          <span class="spacer"></span>
          <button class="btn primary" id="next" ${canNext ? '' : 'disabled'}>${isLast ? 'Voir le résultat' : 'Suivant →'}</button>
        </div>
        <div class="hint"><kbd>A</kbd>–<kbd>${LETTERS[order.length - 1].toUpperCase()}</kbd> ou <kbd>1</kbd>–<kbd>${order.length}</kbd> pour répondre · <kbd>Entrée</kbd> pour continuer</div>
      </div>`);

    const choose = orig => {
      if (item.revealed) return;
      item.chosen = orig;
      if (!settings.exam) { item.revealed = true; record(subject, 'qcm', q.id, orig === q.correct ? 1 : 0); }
      App.refresh();
    };
    const next = () => {
      if (!(settings.exam ? item.chosen != null : item.revealed)) return;
      if (isLast) return finish();
      quiz.index++;
      App.refresh();
    };
    const prev = () => { if (settings.exam && quiz.index > 0) { quiz.index--; App.refresh(); } };

    $$('.option', view).forEach(b => (b.onclick = () => choose(Number(b.dataset.idx))));
    $('#next', view).onclick = next;
    if ($('#prev', view)) $('#prev', view).onclick = prev;
    $('#quit', view).onclick = () => { quiz = null; App.go(`#/s/${subject.id}`); };
    App.onKey(e => {
      const k = e.key.toLowerCase();
      let pos = LETTERS.indexOf(k);
      if (/^[1-9]$/.test(k)) pos = Number(k) - 1;
      if (k.length === 1 && pos >= 0 && pos < order.length) { e.preventDefault(); choose(order[pos]); }
      else if (e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    });
  }

  // Le `code` inline est autorisé dans les énoncés et options.
  const inlineCode = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

  function finish() {
    const { subject, items, settings } = quiz;
    if (settings.exam) items.forEach(i => { i.revealed = true; record(subject, 'qcm', i.q.id, i.chosen === i.q.correct ? 1 : 0); });
    quiz.done = true;
    App.go(`#/s/${subject.id}/qcm`);
  }

  function renderResults() {
    const { subject, items, settings } = quiz;
    const ok = i => i.chosen === i.q.correct;
    const good = items.filter(ok).length;
    const wrong = items.filter(i => !ok(i));
    const score = pct(good, items.length);
    const session = settings.session && subject.sessions.find(s => s.id === settings.session);
    const mood = score >= 90 ? 'Excellent 🎉' : score >= 70 ? 'Très bien 👍' : score >= 50 ? 'Pas mal, continue 💪' : 'À retravailler 📖';
    const review = list => list.map(i => `
      <div class="review-item">
        <span class="tag">${esc(App.qcmGroupLabel(subject, i.q))}</span>
        <div class="q">${ok(i) ? '✓' : '✗'} ${inlineCode(i.q.text)}</div>
        ${ok(i) ? '' : `<div class="ans bad">Ta réponse : ${inlineCode(i.q.options[i.chosen])}</div>`}
        <div class="ans good">Bonne réponse : ${inlineCode(i.q.options[i.q.correct])}</div>
        ${i.q.explain ? `<div class="explain small">${inlineCode(i.q.explain)}</div>` : ''}
        ${App.sourceLink(i.q)}
      </div>`).join('');

    const view = App.mount(subject, 'qcm', `
      <div class="card result">
        ${session ? `<div class="muted">Épreuve QCM — ${esc(session.label)}</div>` : ''}
        <div class="score">${session ? `${(good / items.length * 20).toFixed(1).replace('.', ',')} / 20` : `${good} / ${items.length}`}</div>
        <div class="muted">${session ? `${good} / ${items.length} bonnes réponses${session.total ? ` · ${Math.round(good / items.length * session.total)} / ${session.total} points` : ''} · ` : ''}${score} % — ${mood}</div>
        <div class="row center">
          ${wrong.length ? `<button class="btn primary" id="retry">Refaire les ${wrong.length} erreur(s)</button>` : ''}
          <button class="btn" id="again">Nouveau quiz</button>
        </div>
      </div>
      ${wrong.length ? `<h2>Erreurs</h2><div class="card">${review(wrong)}</div>` : ''}
      ${good ? `<details class="more"><summary>Voir les ${plural(good, 'bonne réponse', 'bonnes réponses')}</summary><div class="card">${review(items.filter(ok))}</div></details>` : ''}`);

    if ($('#retry', view)) $('#retry', view).onclick = () => start(subject, shuffle(wrong.map(i => i.q)), { ...settings, session: null });
    $('#again', view).onclick = () => { quiz = null; App.refresh(); };
  }

  // ---------- Banque de questions ----------
  function renderBank({ subject, params }) {
    const sets = groupsOf(subject);
    const view = App.mount(subject, 'qcm', `
      ${subnav(subject, 'bank')}
      <div class="toolbar">
        <input type="search" id="q" placeholder="Rechercher dans les questions, réponses et explications…" value="${esc(params.get('q') || '')}">
        <select id="f"><option value="">Tous les thèmes</option>${sets.map(({ set, groups }) =>
          `<optgroup label="${esc(set)}">${groups.map(g => `<option value="${esc(g.key)}">${esc(g.label)}</option>`).join('')}</optgroup>`).join('')}</select>
        <select id="st"><option value="">Tous statuts</option><option value="new">Jamais vues</option><option value="bad">Ratées</option><option value="good">Maîtrisées</option></select>
        <button class="btn" id="expand">Tout déplier</button>
      </div>
      <div class="muted small" id="count"></div>
      <div class="card list" id="list"></div>`);

    let expanded = false;
    const draw = () => {
      const term = norm($('#q', view).value.trim());
      const f = $('#f', view).value, st = $('#st', view).value;
      const list = subject.qcm.filter(q => {
        if (f && groupKey(q) !== f) return false;
        const s = stat(subject, 'qcm', q.id);
        if (st === 'new' && s) return false;
        if (st === 'bad' && !(s && s.last === 0)) return false;
        if (st === 'good' && !(s && s.last === 1)) return false;
        return !term || norm([q.text, ...q.options, q.explain, q.group].join(' ')).includes(term);
      });
      $('#count', view).textContent = plural(list.length, 'question');
      $('#list', view).innerHTML = list.length ? list.slice(0, 300).map(q => App.qcmItem(subject, q, true)).join('') +
        (list.length > 300 ? `<p class="muted small">… affine la recherche pour voir les ${list.length - 300} autres.</p>` : '')
        : `<div class="empty">Aucune question ne correspond.</div>`;
      if (expanded) $$('details', $('#list', view)).forEach(d => (d.open = true));
    };
    $('#q', view).oninput = draw;
    $('#f', view).onchange = draw;
    $('#st', view).onchange = draw;
    $('#expand', view).onclick = () => {
      expanded = !expanded;
      $('#expand', view).textContent = expanded ? 'Tout replier' : 'Tout déplier';
      $$('details', $('#list', view)).forEach(d => (d.open = expanded));
    };
    draw();
  }

  App.statusDot = s => {
    const cls = !s ? '' : s.last === 1 ? 'good' : s.last === 0 ? 'bad' : 'mid';
    const title = !s ? 'Jamais vue' : `Vue ${s.seen} fois`;
    return `<span class="dot ${cls}" title="${title}"></span>`;
  };
  App.qcmItem = (subject, q, showGroup = false) => `
    <details class="qa">
      <summary>${App.statusDot(stat(subject, 'qcm', q.id))}<span>${showGroup ? `<span class="tag">${esc(typeof q.fiche === 'number' ? `F${q.fiche}` : q.group)}</span> ` : ''}${inlineCode(q.text)}</span></summary>
      <ol class="opts">${q.options.map((o, i) => `<li class="${i === q.correct ? 'right' : ''}">${inlineCode(o)}</li>`).join('')}</ol>
      ${q.explain ? `<p class="explain small">${inlineCode(q.explain)}</p>` : ''}
      ${App.sourceLink(q)}
    </details>`;

  App.views.qcm = { render };
})();
