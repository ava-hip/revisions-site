// Recherche globale : QCM, questions d'annales, fiches et pages de cours de toutes les matières.
(() => {
  'use strict';
  const { esc, norm, plural, $, snippet, annaleQuestions } = App;
  const LIMIT = 8;

  async function render({ params }) {
    const q = (params.get('q') || '').trim();
    const terms = norm(q).split(/\s+/).filter(t => t.length > 1);
    const view = App.mountPlain(`
      <section class="home-hero"><h1>Recherche</h1><p class="muted">« ${esc(q)} » dans toutes les matières</p></section>
      <div id="sections"></div>
      <div id="pdf"><p class="muted">Recherche dans les cours…</p></div>`, `Recherche — ${q}`);
    if (!terms.length) { view.innerHTML = '<div class="empty">Tape au moins 2 caractères dans la barre de recherche.</div>'; return; }
    const match = text => { const n = norm(text); return terms.every(t => n.includes(t)); };

    const blocks = [];
    for (const s of App.SUBJECTS) {
      const qcm = s.qcm.filter(x => match([x.text, ...x.options, x.explain].join(' ')));
      const ann = annaleQuestions(s).filter(x => match([x.q.question, x.q.context, x.q.answer, x.q.note].join(' ')));
      const fiches = s.fiches.filter(f => f.type === 'md' && match(f.title + ' ' + f.md));
      if (!qcm.length && !ann.length && !fiches.length) continue;
      blocks.push(`
        <section class="search-subject">
          <h2>${esc(s.icon)} ${esc(s.code)} — ${esc(s.name)}</h2>
          ${fiches.length ? group('Fiches', fiches.length, fiches.slice(0, LIMIT).map(f => `
            <a class="search-hit" href="#/s/${s.id}/fiches/${f.id}"><span class="page-pill">📝</span><span><strong>${esc(f.title)}</strong><br>${snippet(f.md, terms, 160)}</span></a>`))
            : ''}
          ${ann.length ? group('Questions d’annales', ann.length, ann.slice(0, LIMIT).map(x => `
            <a class="search-hit" href="#/s/${s.id}/annales/${x.session.id}"><span class="page-pill">${esc(x.session.label)}</span><span>${snippet(x.q.question + ' — ' + x.q.answer, terms, 160)}</span></a>`))
            : ''}
          ${qcm.length ? group('QCM', qcm.length, qcm.slice(0, LIMIT).map(x => `
            <a class="search-hit" href="#/s/${s.id}/qcm/bank?q=${encodeURIComponent(q)}"><span class="page-pill">QCM</span><span>${esc(x.text)}<br><span class="good-text">✓ ${esc(x.options[x.correct])}</span></span></a>`), `#/s/${s.id}/qcm/bank?q=${encodeURIComponent(q)}`)
            : ''}
        </section>`);
    }
    $('#sections', view).innerHTML = blocks.join('') || '';

    try {
      const out = [];
      for (const s of App.SUBJECTS) {
        const res = await App.searchPages(App.subjectPdfs(s), q, { perDoc: 3 });
        if (res.length) out.push(`<h3 class="pdf-subject">${esc(s.icon)} ${esc(s.code)} — pages de documents</h3>${App.pdfResultsHtml(res.slice(0, LIMIT), s)}`);
      }
      $('#pdf', view).innerHTML = out.join('') || (blocks.length ? '' : `<div class="empty">Aucun résultat pour « ${esc(q)} ».</div>`);
    } catch (e) {
      $('#pdf', view).innerHTML = `<p class="muted small">${esc(e.message)}</p>`;
    }
  }

  const group = (title, n, items, more) => `
    <div class="card search-group">
      <div class="row"><h3>${title}</h3><span class="spacer"></span><span class="muted small">${n}</span></div>
      ${items.join('')}
      ${n > items.length ? (more ? `<a class="small" href="${more}">Voir les ${n} résultats →</a>` : `<p class="muted small">… et ${n - items.length} autre(s)</p>`) : ''}
    </div>`;

  App.views.search = { render };
})();
