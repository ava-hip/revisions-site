// Fiches : synthèses Markdown (annales, cours) et fiches de cours PDF.
(() => {
  'use strict';
  const { esc, pct, norm, $, $$, summarize, markdown } = App;

  function render(ctx) {
    const { subject, parts } = ctx;
    if (parts[0]) return renderFiche(subject, parts[0]);
    renderList(subject);
  }

  const groupsOf = subject => {
    const map = new Map();
    for (const f of subject.fiches) {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group).push(f);
    }
    return [...map];
  };
  const excerpt = md => md.replace(/```[\s\S]*?```/g, '').replace(/\*\*Source\s*:.*$/gim, '')
    .replace(/[#*`|>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);

  function renderList(subject) {
    const card = f => {
      if (f.type === 'pdf') {
        const qs = subject.qcm.filter(q => q.fiche === f.num);
        const s = summarize(subject, 'qcm', qs.map(q => q.id));
        return `
          <a class="card fiche-card" href="${App.pdfRoute(f.file, null, subject)}" data-search="${esc(norm(f.title))}">
            <span class="tag">Fiche ${f.num ?? ''} · PDF</span>
            <h3>${esc(f.title)}</h3>
            ${qs.length ? `<div class="bar"><i style="width:${pct(s.mastered, s.total)}%"></i></div>
              <p class="muted small">${qs.length} QCM · ${s.mastered} maîtrisé(s)</p>` : ''}
          </a>`;
      }
      return `
        <a class="card fiche-card" href="#/s/${subject.id}/fiches/${f.id}" data-search="${esc(norm(f.title + ' ' + f.md))}">
          <h3>${esc(f.title)}</h3>
          <p class="muted small">${esc(excerpt(f.md))}…</p>
        </a>`;
    };
    const groups = groupsOf(subject);
    const view = App.mount(subject, 'fiches', `
      <div class="toolbar"><input type="search" id="q" placeholder="Rechercher dans les fiches…"></div>
      <nav class="jump">${groups.map(([g, list], i) => `<a href="#" data-jump="g${i}">${esc(g)} <span class="muted">${list.length}</span></a>`).join('')}</nav>
      ${groups.map(([g, list], i) => `
        <section class="fiche-group" id="g${i}">
          <h2>${esc(g)}</h2>
          <div class="grid">${list.map(card).join('')}</div>
        </section>`).join('')}
      <p class="empty" id="none" hidden>Aucune fiche ne correspond.</p>`);

    $$('[data-jump]', view).forEach(a => (a.onclick = e => { e.preventDefault(); $('#' + a.dataset.jump, view).scrollIntoView({ behavior: 'smooth' }); }));
    const q = $('#q', view);
    q.oninput = () => {
      const t = norm(q.value.trim());
      $$('.fiche-card', view).forEach(c => (c.hidden = t && !c.dataset.search.includes(t)));
      $$('.fiche-group', view).forEach(g => (g.hidden = !$$('.fiche-card', g).some(c => !c.hidden)));
      $('#none', view).hidden = $$('.fiche-card', view).some(c => !c.hidden);
    };
  }

  function renderFiche(subject, id) {
    const fiche = subject.fiches.find(f => f.id === id);
    if (!fiche) return App.go(`#/s/${subject.id}/fiches`);
    if (fiche.type === 'pdf') return App.go(App.pdfRoute(fiche.file, null, subject));
    const sameGroup = subject.fiches.filter(f => f.group === fiche.group);
    const idx = sameGroup.indexOf(fiche);
    const prev = sameGroup[idx - 1], next = sameGroup[idx + 1];

    const view = App.mount(subject, 'fiches', `
      <div class="row fiche-nav">
        <a class="back" href="#/s/${subject.id}/fiches">← Toutes les fiches</a>
        <span class="spacer"></span>
        ${prev ? `<a class="btn small" href="#/s/${subject.id}/fiches/${prev.id}" title="${esc(prev.title)}">← Précédente</a>` : ''}
        ${next ? `<a class="btn small" href="#/s/${subject.id}/fiches/${next.id}" title="${esc(next.title)}">Suivante →</a>` : ''}
      </div>
      <article class="card md fiche-md">
        <span class="tag">${esc(fiche.group)} · ${idx + 1}/${sameGroup.length}</span>
        <h2 class="fiche-title">${esc(fiche.title)}</h2>
        ${markdown(fiche.md, subject.base)}
      </article>`);
    linkTombeEn(subject, view);
    App.onKey(e => {
      if (e.key === 'ArrowLeft' && prev) App.go(`#/s/${subject.id}/fiches/${prev.id}`);
      if (e.key === 'ArrowRight' && next) App.go(`#/s/${subject.id}/fiches/${next.id}`);
    });
  }

  // Rend cliquables les références « Tombé en : Janvier 2024 (D1 Q2) » vers la session concernée.
  function linkTombeEn(subject, view) {
    const byLabel = Object.fromEntries(subject.sessions.map(s => [norm(s.label), s]));
    $$('p, li', view).forEach(el => {
      if (/Tomb[ée] en/i.test(el.textContent)) {
        el.classList.add('tombe');
        el.innerHTML = el.innerHTML.replace(/(Janvier|Juin|Octobre|Février|Mars|Avril|Mai|Juillet|Septembre|Novembre|Décembre)\s+(\d{4})/g, m => {
          const s = byLabel[norm(m)];
          return s ? `<a href="#/s/${subject.id}/annales/${s.id}">${m}</a>` : m;
        });
      } else if (/^\s*Source\s*:/i.test(el.textContent)) el.classList.add('tombe');
    });
  }

  App.views.fiches = { render };
})();
