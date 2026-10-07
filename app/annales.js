// Annales : consultation des sessions, recherche par thème, entraînement aléatoire avec auto-évaluation.
(() => {
  'use strict';
  const { esc, shuffle, pct, norm, plural, $, $$, store, stat, record, annaleQuestions, trainQuestions, tagsOf, markdown, chip } = App;
  const SETTINGS_KEY = 'revisions.train.settings.v1';
  const GRADES = [
    { value: 0, key: '1', label: 'À revoir', cls: 'bad' },
    { value: 0.5, key: '2', label: 'Partiellement', cls: 'mid' },
    { value: 1, key: '3', label: 'Je savais', cls: 'good' },
  ];
  let run = null;
  window.addEventListener('hashchange', () => { if (!/\/train(\?|$)/.test(location.hash)) run = null; });

  // ---------- Blocs partagés ----------
  const pts = n => (n == null ? '' : `${String(n).replace('.', ',')} pt${n > 1 ? 's' : ''}`);

  App.questionMeta = (subject, { q, session, dossier }, { link = true } = {}) => `
    <div class="qmeta">
      ${link ? `<a class="tag" href="#/s/${subject.id}/annales/${session.id}">${esc(session.label)}</a>` : `<span class="tag">${esc(session.label)}</span>`}
      <span class="tag">${esc(dossier.title)} · Q${q.num}</span>
      ${q.points != null ? `<span class="tag strong">${pts(q.points)}</span>` : ''}
      ${q.tags.map(t => `<span class="tag theme">${esc(t)}</span>`).join('')}
    </div>`;

  // Contexte partagé (intro de la session et du dossier), repliable.
  App.questionContext = (subject, { session, dossier }, open = true) => {
    const parts = [session.intro, dossier.intro].filter(Boolean);
    if (!parts.length) return '';
    return `<details class="context" ${open ? 'open' : ''}>
      <summary>Contexte ${dossier.intro ? `du dossier « ${esc(dossier.title)} »` : 'de l’épreuve'}</summary>
      <div class="md">${parts.map(p => markdown(p, subject.base)).join('<hr>')}</div>
    </details>`;
  };

  App.questionBody = (subject, { q }) => `
    <div class="md question-md">${markdown(q.question, subject.base)}</div>
    ${q.context ? `<div class="md qcontext">${markdown(q.context, subject.base)}</div>` : ''}`;

  App.answerBlock = (subject, { q, session }) => `
    <div class="answer">
      <div class="answer-head">Corrigé${session.officialAnswers === false ? ' <span class="badge warn" title="Pas de corrigé officiel pour cette session">proposition, non officiel</span>' : ''}</div>
      <div class="md">${markdown(q.answer, subject.base)}</div>
      ${q.note ? `<div class="md note">${markdown(q.note, subject.base)}</div>` : ''}
    </div>`;

  const sessionBadges = (s) => `
    ${s.sujet ? `<a class="btn small" href="${App.pdfRoute(s.sujet)}">Sujet PDF</a>` : ''}
    ${s.corrige ? `<a class="btn small" href="${App.pdfRoute(s.corrige)}">Corrigé PDF</a>` : ''}`;

  // ---------- Annales : liste + recherche ----------
  function renderAnnales(ctx) {
    const { subject, parts, params } = ctx;
    if (parts[0]) return renderSession(subject, parts[0]);
    const all = annaleQuestions(subject);
    const tags = tagsOf(subject);

    // Épreuve QCM : progression sur ses questions, passage complet ou entraînement dans l'onglet QCM.
    const qcmCard = s => {
      const sum = App.summarize(subject, 'qcm', s.qcm.ids);
      return `
          <div class="card session-card">
            <div class="row"><h3>${esc(s.label)}</h3><span class="spacer"></span>${s.duration ? `<span class="muted small">⏱ ${esc(s.duration)}</span>` : ''}</div>
            <p class="muted small">QCM · ${plural(s.qcm.ids.length, 'question')}${s.total ? ` · ${s.total} points` : ''} · <span class="badge official">corrigé officiel</span>
              ${s.legacy ? ' <span class="badge warn">ancien programme</span>' : ''}</p>
            ${s.intro ? `<p class="small">${esc(s.intro)}</p>` : ''}
            <div class="bar"><i style="width:${pct(sum.mastered, sum.total)}%"></i></div>
            <div class="row wrap">
              <button class="btn primary small" data-qcm="${esc(s.id)}">Passer l’épreuve</button>
              <a class="btn small" href="#/s/${subject.id}/qcm?groups=${encodeURIComponent(s.qcm.groups.join('|'))}">S’entraîner</a>
              ${s.sujet ? `<a class="btn small" href="${App.pdfRoute(s.sujet)}">${s.corrige ? 'Sujet PDF' : 'PDF (sujet + corrigé)'}</a>` : ''}
              ${s.corrige ? `<a class="btn small" href="${App.pdfRoute(s.corrige)}">Corrigé PDF</a>` : ''}
            </div>
          </div>`;
    };
    const card = s => {
          if (s.qcm) return qcmCard(s);
          const ids = all.filter(x => x.session === s).map(x => x.q.id);
          const sum = App.summarize(subject, 'annale', ids);
          return `
          <div class="card session-card${s.mock ? ' mock' : ''}">
            <div class="row"><h3>${esc(s.label)}</h3><span class="spacer"></span>${s.duration ? `<span class="muted small">⏱ ${esc(s.duration)}</span>` : ''}</div>
            <p class="muted small">${s.questionCount ? `${plural(s.questionCount, 'question')} · ${s.total || '?'} points` : 'PDF uniquement'}
              ${s.mock ? ` · <span class="badge mock">${esc(s.badge || 'inédit')}</span>` : `${s.officialAnswers === false ? ' · <span class="badge warn">corrigé non officiel</span>' : ''}
              ${!s.corrige ? ' · pas de corrigé PDF' : ''}${!s.sujet ? ' · pas de sujet PDF' : ''}`}</p>
            ${s.questionCount ? `<div class="bar"><i style="width:${pct(sum.mastered, sum.total)}%"></i></div>` : ''}
            <div class="row wrap">
              ${s.questionCount ? `<a class="btn primary small" href="#/s/${subject.id}/annales/${s.id}">Consulter</a>
                <a class="btn small" href="#/s/${subject.id}/exam/${s.id}">Examen blanc</a>` : ''}
              ${sessionBadges(s)}
            </div>
          </div>`;
    };
    const official = subject.sessions.filter(s => !s.mock), mocks = subject.sessions.filter(s => s.mock);
    const view = App.mount(subject, 'annales', `
      ${mocks.length && official.length ? '<h2 class="first">Annales officielles</h2>' : ''}
      ${official.length ? `<div class="grid sessions">${official.map(card).join('')}</div>` : ''}
      ${App.mockSections(mocks, 'Rédigés au format exact de l’examen à partir de l’analyse des annales. Corrigés proposés, non officiels.').map(sec => `
        <h2${official.length ? '' : ' class="first"'}>${esc(sec.title)}</h2>
        <p class="muted small">${esc(sec.intro)}</p>
        <div class="grid sessions">${sec.sessions.map(card).join('')}</div>`).join('')}
      ${all.length ? `
      <h2>Toutes les questions</h2>
      <div class="toolbar">
        <input type="search" id="q" placeholder="Rechercher (énoncé, corrigé)…" value="${esc(params.get('q') || '')}">
        <select id="tag"><option value="">Tous les thèmes</option>${tags.map(t => `<option ${params.get('tag') === t.tag ? 'selected' : ''}>${esc(t.tag)}</option>`).join('')}</select>
        <select id="sess"><option value="">Toutes les sessions</option>${subject.sessions.filter(s => s.questionCount).map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
        <button class="btn" id="reveal">Afficher les corrigés</button>
      </div>
      <div class="muted small" id="count"></div>
      <div id="list" class="qlist"></div>` : ''}`);

    $$('[data-qcm]', view).forEach(b => (b.onclick = () => App.startAnnaleQcm(subject, subject.sessions.find(s => s.id === b.dataset.qcm))));
    if (!all.length) return;
    let reveal = false;
    const draw = () => {
      const term = norm($('#q', view).value.trim());
      const tag = $('#tag', view).value, sess = $('#sess', view).value;
      const list = all.filter(x =>
        (!tag || x.q.tags.includes(tag)) && (!sess || x.session.id === sess) &&
        (!term || norm([x.q.question, x.q.context, x.q.answer, x.q.note, x.dossier.title].join(' ')).includes(term)));
      $('#count', view).textContent = plural(list.length, 'question');
      $('#list', view).innerHTML = list.map(x => `
        <details class="card qitem">
          <summary>${App.statusDot(stat(subject, 'annale', x.q.id))}<div>${App.questionMeta(subject, x)}<div class="qtitle">${esc(firstLine(x.q.question))}</div></div></summary>
          ${App.questionContext(subject, x, false)}
          ${App.questionBody(subject, x)}
          <div class="reveal-zone" ${reveal ? '' : 'hidden'}>${App.answerBlock(subject, x)}</div>
          <button class="btn small toggle-answer">${reveal ? 'Masquer' : 'Voir'} le corrigé</button>
        </details>`).join('') || `<div class="empty">Aucune question ne correspond.</div>`;
      bindToggles($('#list', view));
    };
    $('#q', view).oninput = draw;
    $('#tag', view).onchange = draw;
    $('#sess', view).onchange = draw;
    $('#reveal', view).onclick = () => {
      reveal = !reveal;
      $('#reveal', view).textContent = reveal ? 'Masquer les corrigés' : 'Afficher les corrigés';
      draw();
    };
    draw();
  }

  const firstLine = md => String(md).split('\n').find(l => l.trim()).replace(/[*`#>]/g, '').trim();

  function bindToggles(rootEl) {
    $$('.toggle-answer', rootEl).forEach(b => (b.onclick = () => {
      const zone = b.parentElement.querySelector('.reveal-zone');
      zone.hidden = !zone.hidden;
      b.textContent = zone.hidden ? 'Voir le corrigé' : 'Masquer le corrigé';
    }));
  }

  // ---------- Une session, présentée comme la copie d'examen ----------
  function renderSession(subject, id) {
    const s = subject.sessions.find(x => x.id === id);
    if (!s) return App.go(`#/s/${subject.id}/annales`);
    const view = App.mount(subject, 'annales', `
      <a class="back" href="#/s/${subject.id}/annales">← Toutes les annales</a>
      <div class="paper-head card">
        <div>
          <h2>Session ${esc(s.label)}</h2>
          <p class="muted small">${[s.duration && `Durée : ${esc(s.duration)}`, s.total && `${s.total} points`, plural(s.questionCount, 'question')].filter(Boolean).join(' · ')}
            ${s.officialAnswers === false ? ' · <span class="badge warn">corrigé non officiel (proposition)</span>' : ''}</p>
          ${s.dossiers.length ? `<table class="bareme"><tbody>${s.dossiers.map((d, i) => `<tr><td>Dossier ${i + 1} — ${esc(d.title)}</td><td class="num">${d.points ?? ''} pts</td></tr>`).join('')}</tbody></table>` : ''}
        </div>
        <div class="col">
          ${s.questionCount ? `<a class="btn primary" href="#/s/${subject.id}/exam/${s.id}">⏱ Passer en examen blanc</a>` : ''}
          <button class="btn" id="reveal-all">Afficher tous les corrigés</button>
          <div class="row wrap">${sessionBadges(s)}</div>
        </div>
      </div>
      ${s.intro ? `<div class="card md">${markdown(s.intro, subject.base)}</div>` : ''}
      ${s.dossiers.map((d, di) => `
        <section class="dossier">
          <h2>Dossier ${di + 1} — ${esc(d.title)} <span class="muted small">${d.points ?? ''} pts</span></h2>
          ${d.intro ? `<div class="card md">${markdown(d.intro, subject.base)}</div>` : ''}
          ${d.questions.map(q => {
            const x = { q, session: s, dossier: d };
            return `<article class="card qblock">
              <div class="qhead"><strong>Question ${q.num}</strong>${q.points != null ? `<span class="tag strong">${pts(q.points)}</span>` : ''}
                ${q.tags.map(t => `<span class="tag theme">${esc(t)}</span>`).join('')}</div>
              ${App.questionBody(subject, x)}
              <div class="reveal-zone" hidden>${App.answerBlock(subject, x)}</div>
              <button class="btn small toggle-answer">Voir le corrigé</button>
            </article>`;
          }).join('')}
        </section>`).join('')}`);

    bindToggles(view);
    let all = false;
    $('#reveal-all', view).onclick = () => {
      all = !all;
      $$('.reveal-zone', view).forEach(z => (z.hidden = !all));
      $$('.toggle-answer', view).forEach(b => (b.textContent = all ? 'Masquer le corrigé' : 'Voir le corrigé'));
      $('#reveal-all', view).textContent = all ? 'Masquer tous les corrigés' : 'Afficher tous les corrigés';
    };
  }

  // ---------- Entraînement aléatoire ----------
  function renderTrain(ctx) {
    const { subject } = ctx;
    if (run && run.subject === subject) return run.done ? renderTrainEnd() : renderTrainCard();
    renderTrainSetup(ctx);
  }

  function renderTrainSetup({ subject, params }) {
    const settings = { count: '10', ...store.get(SETTINGS_KEY, {}) };
    const mode = params.get('mode') || 'all';
    const preTags = params.get('tags') ? params.get('tags').split(',') : null;
    const sessions = subject.sessions.filter(s => s.questionCount && s.train !== false);
    const qcmSessions = subject.sessions.filter(s => s.qcm);
    const tags = tagsOf(subject);

    const view = App.mount(subject, 'train', `
      ${sessions.length ? `
      ${qcmSessions.length ? '<h2 class="first">Annales à questions ouvertes</h2>' : ''}
      <div class="intro-text">
        <p>Questions ouvertes tirées au hasard dans toutes les annales. Réfléchis (ou écris) ta réponse, affiche le corrigé, puis évalue-toi honnêtement.</p>
      </div>
      <form class="card form" id="setup">
        <fieldset>
          <legend>Sessions <span class="legend-actions"><a href="#" data-group="session" data-all="1">Tout</a> · <a href="#" data-group="session" data-all="0">Aucune</a></span></legend>
          <div class="chips">${sessions.map(s => chip('session', s.id, s.label, true, 'checkbox')).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>Thèmes <span class="legend-actions"><a href="#" data-group="tag" data-all="1">Tout</a> · <a href="#" data-group="tag" data-all="0">Aucun</a></span></legend>
          <div class="chips">${tags.map(t => chip('tag', t.tag, `${t.tag} (${t.count})`, preTags ? preTags.includes(t.tag) : true, 'checkbox')).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>Questions</legend>
          <div class="chips">
            ${chip('mode', 'all', 'Toutes', mode === 'all')}
            ${chip('mode', 'new', 'Jamais vues', mode === 'new')}
            ${chip('mode', 'errors', 'Marquées « À revoir »', mode === 'errors')}
            ${chip('mode', 'weak', 'Pas encore maîtrisées', mode === 'weak')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Nombre de questions</legend>
          <div class="chips">${['5', '10', '20', 'all'].map(c => chip('count', c, c === 'all' ? 'Toutes' : c, settings.count === c)).join('')}</div>
        </fieldset>
        <div class="row">
          <button class="btn primary" type="submit" id="start">Commencer</button>
          <span class="muted small" id="avail"></span>
        </div>
      </form>` : ''}
      ${qcmSessions.length ? trainQcmForm(subject, qcmSessions, settings, !sessions.length) : ''}`);

    if (qcmSessions.length) bindTrainQcm(view, subject, qcmSessions);
    if (!sessions.length) return;
    const form = $('#setup', view);
    const all = trainQuestions(subject);
    const pool = () => {
      const fd = new FormData(form);
      const ss = fd.getAll('session'), ts = fd.getAll('tag'), m = fd.get('mode');
      return all.filter(x => {
        if (!ss.includes(x.session.id)) return false;
        if (x.q.tags.length && !x.q.tags.some(t => ts.includes(t))) return false;
        const s = stat(subject, 'annale', x.q.id);
        if (m === 'new') return !s;
        if (m === 'errors') return s && s.last === 0;
        if (m === 'weak') return !s || s.last !== 1;
        return true;
      });
    };
    const update = () => {
      const n = pool().length;
      $('#avail', view).textContent = plural(n, 'question disponible', 'questions disponibles');
      $('#start', view).disabled = n === 0;
    };
    form.addEventListener('change', update);
    $$('[data-all]', view).forEach(a => (a.onclick = e => {
      e.preventDefault();
      $$(`input[name=${a.dataset.group}]`, form).forEach(i => (i.checked = a.dataset.all === '1'));
      update();
    }));
    update();
    form.onsubmit = e => {
      e.preventDefault();
      const count = new FormData(form).get('count');
      store.set(SETTINGS_KEY, { ...store.get(SETTINGS_KEY, {}), count });
      const picked = shuffle(pool());
      startTrain(subject, picked.slice(0, count === 'all' ? picked.length : Number(count)));
    };
  }

  // Annales QCM : tirage au hasard parmi les sessions cochées, puis le QCM avec correction après chaque question.
  const trainQcmForm = (subject, qcmSessions, settings, alone) => `
      ${alone ? '' : '<h2>Annales QCM</h2>'}
      <div class="intro-text">
        <p>Questions des annales QCM tirées au hasard, avec la correction après chaque réponse.</p>
      </div>
      <form class="card form" id="setup-qcm">
        <fieldset>
          <legend>Sessions <span class="legend-actions"><a href="#" data-qall="1">Tout</a> · <a href="#" data-qall="0">Aucune</a></span></legend>
          <div class="chips">${qcmSessions.map(s => chip('qsession', s.id, `${s.label}${s.legacy ? ' · ancien programme' : ''} (${s.qcm.ids.length})`, true, 'checkbox')).join('')}</div>
        </fieldset>
        <fieldset>
          <legend>Questions</legend>
          <div class="chips">
            ${chip('qmode', 'all', 'Toutes', true)}
            ${chip('qmode', 'new', 'Jamais vues', false)}
            ${chip('qmode', 'errors', 'Ratées la dernière fois', false)}
            ${chip('qmode', 'weak', 'Pas encore maîtrisées', false)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Nombre de questions</legend>
          <div class="chips">${['10', '20', '40', 'all'].map(c => chip('qcount', c, c === 'all' ? 'Toutes' : c, (settings.qcmCount || '20') === c)).join('')}</div>
        </fieldset>
        <div class="row">
          <button class="btn primary" type="submit" id="start-qcm">Commencer</button>
          <span class="muted small" id="avail-qcm"></span>
        </div>
      </form>`;

  function bindTrainQcm(view, subject, qcmSessions) {
    const form = $('#setup-qcm', view);
    const byId = Object.fromEntries(subject.qcm.map(q => [q.id, q]));
    const pool = () => {
      const fd = new FormData(form);
      const m = fd.get('qmode');
      return qcmSessions.filter(s => fd.getAll('qsession').includes(s.id)).flatMap(s => s.qcm.ids.map(id => byId[id])).filter(q => {
        if (!q) return false;
        const st = stat(subject, 'qcm', q.id);
        if (m === 'new') return !st;
        if (m === 'errors') return st && st.last === 0;
        if (m === 'weak') return !st || st.last !== 1;
        return true;
      });
    };
    const update = () => {
      const n = pool().length;
      $('#avail-qcm', view).textContent = plural(n, 'question disponible', 'questions disponibles');
      $('#start-qcm', view).disabled = n === 0;
    };
    form.addEventListener('change', update);
    $$('[data-qall]', form).forEach(a => (a.onclick = e => {
      e.preventDefault();
      $$('input[name=qsession]', form).forEach(i => (i.checked = a.dataset.qall === '1'));
      update();
    }));
    update();
    form.onsubmit = e => {
      e.preventDefault();
      const count = new FormData(form).get('qcount');
      store.set(SETTINGS_KEY, { ...store.get(SETTINGS_KEY, {}), qcmCount: count });
      const picked = shuffle(pool());
      App.startQcmWith(subject, picked.slice(0, count === 'all' ? picked.length : Number(count)), { exam: false, shuffleOptions: true });
    };
  }

  function startTrain(subject, items) {
    run = { subject, index: 0, done: false, items: items.map(x => ({ ...x, draft: '', revealed: false, grade: null })) };
    App.go(`#/s/${subject.id}/train`);
  }

  function renderTrainCard() {
    const { subject, items } = run;
    const item = items[run.index];
    const isLast = run.index === items.length - 1;

    const view = App.mount(subject, 'train', `
      <div class="progress">
        <span class="num">${run.index + 1} / ${items.length}</span>
        <div class="bar"><i style="width:${pct(items.filter(i => i.grade != null).length, items.length)}%"></i></div>
        <button class="btn ghost small" id="quit">Terminer</button>
      </div>
      <article class="card quiz-card">
        ${App.questionMeta(subject, item)}
        ${App.questionContext(subject, item)}
        ${App.questionBody(subject, item)}
        <textarea id="draft" class="draft" rows="4" placeholder="Ta réponse (facultatif) — écris-la pour mieux la comparer au corrigé">${esc(item.draft)}</textarea>
        ${item.revealed ? App.answerBlock(subject, item) + `
          <div class="grade-row">
            <span class="muted small">Ton auto-évaluation :</span>
            ${GRADES.map(g => `<button class="btn grade ${g.cls} ${item.grade === g.value ? 'on' : ''}" data-v="${g.value}"><kbd>${g.key}</kbd> ${g.label}</button>`).join('')}
          </div>` : `
          <div class="row actions-row"><span class="spacer"></span><button class="btn primary" id="show">Voir le corrigé</button></div>`}
        <div class="row actions-row">
          ${run.index > 0 ? `<button class="btn ghost" id="prev">← Précédente</button>` : ''}
          <span class="spacer"></span>
          ${item.revealed ? `<button class="btn primary" id="next" ${item.grade == null ? 'disabled' : ''}>${isLast ? 'Terminer' : 'Suivante →'}</button>` : ''}
        </div>
        <div class="hint"><kbd>Espace</kbd> corrigé · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> auto-évaluation · <kbd>Entrée</kbd> suivante</div>
      </article>`);

    const draft = $('#draft', view);
    draft.oninput = () => (item.draft = draft.value);
    const show = () => { if (!item.revealed) { item.revealed = true; App.refresh(); } };
    const grade = v => {
      if (!item.revealed) return;
      if (item.grade == null) record(subject, 'annale', item.q.id, v);
      else App.amend(subject, 'annale', item.q.id, v);
      item.grade = v;
      App.refresh();
    };
    const next = () => {
      if (item.grade == null) return;
      if (isLast) { run.done = true; return App.refresh(); }
      run.index++;
      App.refresh();
    };
    if ($('#show', view)) $('#show', view).onclick = show;
    $$('.grade', view).forEach(b => (b.onclick = () => grade(Number(b.dataset.v))));
    if ($('#next', view)) $('#next', view).onclick = next;
    if ($('#prev', view)) $('#prev', view).onclick = () => { run.index--; App.refresh(); };
    $('#quit', view).onclick = () => { run.done = true; App.refresh(); };
    App.onKey(e => {
      if (e.key === ' ' && !item.revealed) { e.preventDefault(); show(); }
      else if (/^[123]$/.test(e.key)) grade(GRADES[Number(e.key) - 1].value);
      else if (e.key === 'Enter') { e.preventDefault(); item.revealed ? next() : show(); }
    });
  }

  function renderTrainEnd() {
    const { subject, items } = run;
    const graded = items.filter(i => i.grade != null);
    const count = v => graded.filter(i => i.grade === v).length;
    const toReview = graded.filter(i => i.grade < 1);
    const score = graded.reduce((n, i) => n + i.grade, 0);

    const view = App.mount(subject, 'train', `
      <div class="card result">
        <div class="score">${pct(score, graded.length || 1)} %</div>
        <div class="muted">${plural(graded.length, 'question traitée', 'questions traitées')}</div>
        <div class="row center grades-summary">
          <span class="pill good">✓ ${count(1)} je savais</span>
          <span class="pill mid">~ ${count(0.5)} partiellement</span>
          <span class="pill bad">✗ ${count(0)} à revoir</span>
        </div>
        <div class="row center">
          ${toReview.length ? `<button class="btn primary" id="retry">Refaire les ${toReview.length} question(s) non maîtrisée(s)</button>` : ''}
          <button class="btn" id="again">Nouvel entraînement</button>
        </div>
      </div>
      ${toReview.length ? `<h2>À retravailler</h2>${toReview.map(i => `
        <details class="card qitem">
          <summary>${App.statusDot({ last: i.grade })}<div>${App.questionMeta(subject, i)}<div class="qtitle">${esc(firstLine(i.q.question))}</div></div></summary>
          ${App.questionBody(subject, i)}${App.answerBlock(subject, i)}
        </details>`).join('')}` : ''}`);

    if ($('#retry', view)) $('#retry', view).onclick = () => startTrain(subject, shuffle(toReview.map(({ q, session, dossier }) => ({ q, session, dossier }))));
    $('#again', view).onclick = () => { run = null; App.refresh(); };
  }

  App.startTrainWith = startTrain;
  App.views.annales = { render: renderAnnales };
  App.views.train = { render: renderTrain };
})();
