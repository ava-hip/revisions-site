// Cours : bibliothèque de supports, recherche plein texte dans les PDF, visionneuse avec QCM et fiches liés.
(() => {
  'use strict';
  const { esc, norm, plural, $, $$, stat, snippet } = App;

  // ---------- Recherche dans le texte des PDF ----------
  let normCache = null;
  async function searchPages(files, query, { perDoc = 5 } = {}) {
    const pages = await App.loadSearch();
    normCache ||= {};
    const terms = norm(query).split(/\s+/).filter(t => t.length > 1);
    if (!terms.length) return [];
    const results = [];
    for (const file of files) {
      const raw = pages[file];
      if (!raw) continue;
      const normed = (normCache[file] ||= raw.map(norm));
      const hits = [];
      normed.forEach((t, i) => { if (terms.every(term => t.includes(term))) hits.push(i); });
      if (hits.length) results.push({ file, total: hits.length, hits: hits.slice(0, perDoc).map(i => ({ page: i + 1, html: snippet(raw[i], terms) })) });
    }
    return results.sort((a, b) => b.total - a.total);
  }
  App.searchPages = searchPages;

  const subjectPdfs = subject => [
    ...subject.cours.map(c => c.file),
    ...subject.fiches.filter(f => f.file).map(f => f.file),
    ...subject.sessions.flatMap(s => [s.sujet, s.corrige]).filter(Boolean),
  ];
  App.subjectPdfs = subjectPdfs;

  App.pdfResultsHtml = (results, subject) => results.map(r => `
    <div class="card search-doc">
      <div class="row"><a class="search-doc-title" href="${App.pdfRoute(r.file, null, subject)}">📄 ${esc(App.pdfTitle(r.file))}</a>
        <span class="spacer"></span><span class="muted small">${plural(r.total, 'page')}</span></div>
      ${r.hits.map(h => `<a class="search-hit" href="${App.pdfRoute(r.file, h.page, subject)}"><span class="page-pill">p. ${h.page}</span><span>${h.html}</span></a>`).join('')}
      ${r.total > r.hits.length ? `<p class="muted small">… et ${r.total - r.hits.length} autre(s) page(s)</p>` : ''}
    </div>`).join('');

  // ---------- Liste des cours ----------
  function renderList({ subject, params }) {
    const own = subject.cours.filter(c => !c.shared);
    const shared = subject.cours.filter(c => c.shared);
    const qcmCount = file => subject.qcm.filter(q => q.source?.file === file).length;
    const card = c => {
      const n = qcmCount(c.file);
      return `
      <a class="card cours-card" href="${App.pdfRoute(c.file, null, subject)}">
        <div class="cours-icon">📕</div>
        <div>
          <h3>${esc(c.title)}</h3>
          <p class="muted small">${c.pages ? plural(c.pages, 'page') : 'PDF'}${n ? ` · ${n} QCM liés` : ''}${c.shared ? ` · partagé depuis ${esc(c.shared.split(' - ')[0])}` : ''}</p>
        </div>
      </a>`;
    };
    const view = App.mount(subject, 'cours', `
      <div class="toolbar">
        <input type="search" id="q" placeholder="Rechercher un mot dans tous les cours, fiches et annales de la matière…" value="${esc(params.get('q') || '')}">
      </div>
      <div id="results"></div>
      <div id="library">
        <div class="grid cours-grid">${own.map(card).join('')}</div>
        ${shared.length ? `<h2>Cours partagés avec d’autres matières</h2><div class="grid cours-grid">${shared.map(card).join('')}</div>` : ''}
      </div>`);

    const input = $('#q', view);
    let t;
    const run = async () => {
      const q = input.value.trim();
      $('#library', view).hidden = q.length >= 2;
      if (q.length < 2) { $('#results', view).innerHTML = ''; return; }
      $('#results', view).innerHTML = '<p class="muted">Recherche…</p>';
      try {
        const res = await searchPages(subjectPdfs(subject), q);
        if (input.value.trim() !== q) return;
        $('#results', view).innerHTML = res.length
          ? `<p class="muted small">${plural(res.reduce((n, r) => n + r.total, 0), 'page trouvée', 'pages trouvées')} dans ${plural(res.length, 'document')}</p>${App.pdfResultsHtml(res, subject)}`
          : `<div class="empty">Aucun résultat pour « ${esc(q)} ».</div>`;
      } catch (e) {
        $('#results', view).innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      }
    };
    input.oninput = () => { clearTimeout(t); t = setTimeout(run, 200); };
    if (input.value) run();
  }

  // ---------- Visionneuse ----------
  function renderViewer({ subject, params }) {
    const file = params.get('f');
    const page = Number(params.get('p')) || null;
    if (!file) return App.go(`#/s/${subject.id}/cours`);
    const title = App.pdfTitle(file);
    const course = subject.cours.find(c => c.file === file);
    const fichePdf = subject.fiches.find(f => f.file === file);
    const session = subject.sessions.find(s => s.sujet === file || s.corrige === file);
    const tab = course ? 'cours' : fichePdf ? 'fiches' : 'annales';

    const related = subject.qcm
      .filter(q => q.source?.file === file || (fichePdf && q.fiche === fichePdf.num))
      .sort((a, b) => (a.source?.page || 0) - (b.source?.page || 0));
    const fileName = file.split('/').pop();
    const synth = subject.fiches.filter(f => f.type === 'md' && f.md.includes(fileName));
    const siblings = course ? subject.cours : fichePdf ? subject.fiches.filter(f => f.file) : [];
    const idx = siblings.findIndex(x => x.file === file);
    const prev = siblings[idx - 1], next = siblings[idx + 1];
    const back = course ? [`#/s/${subject.id}/cours`, 'Tous les cours'] : fichePdf ? [`#/s/${subject.id}/fiches`, 'Toutes les fiches']
      : [`#/s/${subject.id}/annales${session ? '/' + session.id : ''}`, session ? `Session ${session.label}` : 'Annales'];

    const view = App.mount(subject, tab, `
      <div class="row fiche-nav">
        <a class="back" href="${back[0]}">← ${esc(back[1])}</a>
        <span class="spacer"></span>
        ${prev ? `<a class="btn small" href="${App.pdfRoute(prev.file, null, subject)}" title="${esc(prev.title)}">← Précédent</a>` : ''}
        ${next ? `<a class="btn small" href="${App.pdfRoute(next.file, null, subject)}" title="${esc(next.title)}">Suivant →</a>` : ''}
        <a class="btn small" ${App.assetAttrs(file, page)} target="_blank" rel="noopener">Ouvrir en plein écran ↗</a>
      </div>
      <h2 class="fiche-title">${esc(title)}${page ? ` <span class="muted small">· page ${page}</span>` : ''}</h2>
      <div class="viewer">
        <iframe ${App.assetAttrs(file, page)} title="${esc(title)}"></iframe>
        <aside class="card side">
          <input type="search" id="find" placeholder="Chercher dans ce document…">
          <div id="find-results"></div>
          ${synth.length ? `<h3 class="side-title">Fiches de synthèse</h3>
            ${synth.map(f => `<a class="side-link" href="#/s/${subject.id}/fiches/${f.id}">📝 ${esc(f.title)}</a>`).join('')}` : ''}
          ${related.length ? `
            <div class="row side-title"><h3>${plural(related.length, 'QCM lié', 'QCM liés')}</h3><span class="spacer"></span>
              <button class="btn primary small" id="quiz">Quiz</button></div>
            <p class="muted small">Clique sur une question pour voir la réponse.</p>
            ${related.map(q => `
              <details class="qa">
                <summary>${App.statusDot(stat(subject, 'qcm', q.id))}<span>${q.source?.page ? `<a class="page-pill" href="${App.pdfRoute(file, q.source.page, subject)}">p. ${q.source.page}</a> ` : ''}${esc(q.text)}</span></summary>
                <ol class="opts">${q.options.map((o, i) => `<li class="${i === q.correct ? 'right' : ''}">${esc(o)}</li>`).join('')}</ol>
                ${q.explain ? `<p class="explain small">${esc(q.explain)}</p>` : ''}
              </details>`).join('')}` : ''}
          ${!synth.length && !related.length ? '<p class="muted small">Aucun QCM ni fiche liés à ce document.</p>' : ''}
        </aside>
      </div>`, { wide: true });

    if ($('#quiz', view)) $('#quiz', view).onclick = () => App.startQcmWith(subject, App.shuffle(related), { exam: false, shuffleOptions: true });
    const find = $('#find', view);
    let t;
    find.oninput = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = find.value.trim();
        if (q.length < 2) { $('#find-results', view).innerHTML = ''; return; }
        const [r] = await searchPages([file], q, { perDoc: 30 });
        $('#find-results', view).innerHTML = r
          ? r.hits.map(h => `<a class="search-hit compact" href="${App.pdfRoute(file, h.page, subject)}"><span class="page-pill">p. ${h.page}</span><span>${h.html}</span></a>`).join('')
          : '<p class="muted small">Aucun résultat (le texte des images n’est pas cherchable).</p>';
      }, 200);
    };
  }

  App.views.cours = { render: ctx => (ctx.parts[0] === 'view' ? renderViewer(ctx) : renderList(ctx)) };
})();
