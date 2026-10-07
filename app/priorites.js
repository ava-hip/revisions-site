// Priorités : ce qui tombe le plus aux annales (analyse rédigée + statistiques calculées par thème).
(() => {
  'use strict';
  const { esc, pct, plural, $, $$, summarize, annaleQuestions, tagsOf } = App;
  const LEVELS = [
    { label: 'Basse', cls: 'p0' },
    { label: 'Utile', cls: 'p1' },
    { label: 'Importante', cls: 'p2' },
    { label: 'Indispensable', cls: 'p3' },
  ];

  // Statistiques par thème : questions, sessions, présence aux dernières sessions, maîtrise.
  function tagStats(subject) {
    const all = annaleQuestions(subject).filter(x => !x.session.mock);
    const sessions = subject.sessions.filter(s => s.questionCount && !s.mock);
    const recent = new Set(sessions.slice(-2).map(s => s.id));
    return tagsOf(subject).map(({ tag }) => {
      const list = all.filter(x => x.q.tags.includes(tag));
      const count = list.length;
      const inSessions = new Set(list.map(x => x.session.id));
      const recentCount = list.filter(x => recent.has(x.session.id)).length;
      const points = list.reduce((n, x) => n + (x.q.points || 0), 0);
      return {
        tag, count, points, recentCount,
        sessions: sessions.filter(s => inSessions.has(s.id)),
        nbSessions: sessions.length,
        mastery: summarize(subject, 'annale', list.map(x => x.q.id)),
        score: count + 2 * recentCount + 3 * inSessions.size,
      };
    }).filter(s => s.count).sort((a, b) => b.score - a.score);
  }
  App.tagStats = tagStats;

  const findFiche = (subject, title) => title && subject.fiches.find(f => f.title === title);
  const qcmGroupKeys = (subject, groups) => {
    const keys = new Set();
    for (const q of subject.qcm) if (groups.includes(q.group)) keys.add(`${q.set}::${q.group}`);
    return [...keys];
  };

  function render({ subject }) {
    const curated = subject.priorites;
    const stats = tagStats(subject);
    const maxCount = Math.max(1, ...stats.map(s => s.count));
    const sessions = subject.sessions.filter(s => s.questionCount && !s.mock);
    const mocks = subject.sessions.filter(s => s.mock);

    const cards = curated ? curated.items.map((it, i) => {
      const lv = LEVELS[it.level ?? 1];
      const fiche = findFiche(subject, it.fiche);
      const groups = it.qcm ? qcmGroupKeys(subject, it.qcm) : [];
      const tagsIn = (it.tags || []).filter(t => stats.some(s => s.tag === t));
      const ids = annaleQuestions(subject).filter(x => !x.session.mock && x.q.tags.some(t => tagsIn.includes(t))).map(x => x.q.id);
      const m = summarize(subject, 'annale', ids);
      return `
        <article class="card prio ${lv.cls}">
          <div class="prio-head">
            <span class="prio-rank">${i + 1}</span>
            <h3>${esc(it.title)}</h3>
            <span class="prio-level ${lv.cls}">${lv.label}</span>
          </div>
          <p class="prio-why">${esc(it.why)}</p>
          ${it.keys?.length ? `<ul class="prio-keys">${it.keys.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
          ${ids.length ? `<div class="prio-mastery"><div class="bar"><i style="width:${pct(m.mastered, m.total)}%"></i></div>
            <span class="muted small">${m.mastered}/${m.total} questions d’annales maîtrisées</span></div>` : ''}
          ${fiche || groups.length || tagsIn.length ? `<div class="row wrap prio-actions">
            ${fiche ? `<a class="btn small" href="#/s/${subject.id}/fiches/${fiche.id}">📝 Fiche</a>` : ''}
            ${groups.length ? `<a class="btn small" href="#/s/${subject.id}/qcm?groups=${encodeURIComponent(groups.join('|'))}">⚡ QCM ciblé</a>` : ''}
            ${tagsIn.length ? `<a class="btn primary small" href="#/s/${subject.id}/train?tags=${encodeURIComponent(tagsIn.join(','))}">🧠 Questions d’annales</a>` : ''}
          </div>` : ''}
        </article>`;
    }).join('') : '';

    const incontournables = subject.qcm.filter(q => /incontournable/i.test(q.set));
    const top = subject.fiches.filter(f => /top à savoir/i.test(f.group));

    const view = App.mount(subject, 'prio', `
      <section class="prio-intro">
        <p class="lead">${esc(curated?.intro || `Thèmes classés selon leur fréquence dans les ${plural(sessions.length, 'session')} d’annales, en donnant plus de poids aux sessions les plus récentes.`)}</p>
        <div class="row wrap">
          ${top.length ? `<a class="btn primary" href="#/s/${subject.id}/fiches/${top[0].id}">📌 Fiches « Top à savoir » (${top.length})</a>` : ''}
          ${incontournables.length ? `<a class="btn" href="#/s/${subject.id}/qcm?groups=${encodeURIComponent([...new Set(incontournables.map(q => `${q.set}::${q.group}`))].join('|'))}">⚡ QCM « Incontournables » (${incontournables.length})</a>` : ''}
          ${mocks.length ? `<a class="btn" href="#/s/${subject.id}/exam">⏱ Sujets d’entraînement (${mocks.length})</a>`
            : sessions.length ? `<a class="btn" href="#/s/${subject.id}/exam/${sessions[sessions.length - 1].id}">⏱ Examen blanc le plus récent</a>` : ''}
        </div>
      </section>

      ${cards ? `<h2>Par ordre de priorité</h2><div class="prio-list">${cards}</div>` : ''}

      ${stats.length ? `
      <h2>Fréquence des thèmes aux annales</h2>
      <div class="card freq" style="--n:${sessions.length}">
        <div class="freq-row freq-head">
          <span>Thème</span><span>Questions</span>
          ${sessions.map(s => `<span class="freq-sess" title="${esc(s.label)}">${esc(shortLabel(s.label))}</span>`).join('')}
          <span>Maîtrise</span>
        </div>
        ${stats.map(s => `
          <a class="freq-row" href="#/s/${subject.id}/train?tags=${encodeURIComponent(s.tag)}" title="S’entraîner sur ${esc(s.tag)}">
            <span class="freq-tag">${esc(s.tag)}</span>
            <span class="freq-bar"><i style="width:${pct(s.count, maxCount)}%"></i><b>${s.count}</b></span>
            ${sessions.map(x => `<span class="freq-dot ${s.sessions.includes(x) ? 'on' : ''}"></span>`).join('')}
            <span class="num">${s.mastery.mastered}/${s.mastery.total}</span>
          </a>`).join('')}
      </div>
      <p class="muted small">Un point = le thème est tombé lors de cette session. Clique sur une ligne pour t’entraîner sur ce thème.</p>` : ''}`);
  }

  const shortLabel = label => {
    const m = label.match(/^(\S+)\s+(\d{4})$/);
    return m ? `${m[1].slice(0, 4)}. ${m[2].slice(2)}` : label.slice(0, 8);
  };

  App.views.prio = { render };
})();
