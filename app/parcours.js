// Parcours guidé : étapes pas à pas, exercices avec exécution SQL dans le navigateur (sql.js / SQLite).
(() => {
  'use strict';
  const { esc, pct, plural, $, $$, store, markdown } = App;
  const SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  const progKey = s => `revisions.parcours.${s.id}`;
  const draftKey = s => `revisions.parcours.drafts.${s.id}`;

  // ---------- Moteur SQL ----------
  let enginePromise = null;
  function loadEngine() {
    enginePromise ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SQLJS + 'sql-wasm.js';
      script.onload = () => window.initSqlJs({ locateFile: f => SQLJS + f }).then(resolve, reject);
      script.onerror = () => reject(new Error('Moteur SQL indisponible (connexion Internet requise).'));
      document.head.appendChild(script);
    }).catch(e => { enginePromise = null; throw e; });
    return enginePromise;
  }
  // Traduit les quelques syntaxes Oracle courantes vers SQLite.
  const toSqlite = sql => sql
    .replace(/FETCH\s+FIRST\s+(\d+)\s+ROWS?\s+ONLY/gi, 'LIMIT $1')
    .replace(/FETCH\s+FIRST\s+ROWS?\s+ONLY/gi, 'LIMIT 1')
    .replace(/\bNVL\s*\(/gi, 'IFNULL(')
    .replace(/\bSYSDATE\b/gi, "DATE('now')")
    .replace(/\bFROM\s+dual\b/gi, '')
    .replace(/^\s*\/\s*$/gm, '');

  async function runSql(data, sql, verify) {
    const SQL = await loadEngine();
    const db = new SQL.Database();
    try {
      if (data) db.run(data);
      let res;
      if (verify) { db.run(toSqlite(sql)); res = db.exec(verify); }
      else res = db.exec(toSqlite(sql));
      const last = res[res.length - 1];
      return last ? { columns: last.columns, rows: last.values } : { columns: [], rows: [], empty: true };
    } finally { db.close(); }
  }

  const normCell = v => (v == null ? null : typeof v === 'number' ? Math.round(v * 100) / 100 : String(v).trim());
  function sameResult(a, b, ordered) {
    if (a.columns.length !== b.columns.length) return `Ton résultat a ${plural(a.columns.length, 'colonne')}, la correction en a ${b.columns.length}.`;
    if (a.rows.length !== b.rows.length) return `Ton résultat a ${plural(a.rows.length, 'ligne')}, la correction en a ${b.rows.length}.`;
    const key = r => JSON.stringify(r.map(normCell));
    const ra = a.rows.map(key), rb = b.rows.map(key);
    if (!ordered) { ra.sort(); rb.sort(); }
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ordered ? 'Les lignes ne sont pas les mêmes, ou pas dans le même ordre.' : 'Même nombre de lignes, mais les valeurs diffèrent.';
    return null;
  }

  const resultTable = r => {
    if (r.empty) return '<p class="muted small">Requête exécutée (aucun résultat à afficher).</p>';
    if (!r.rows.length) return '<p class="muted small">Aucune ligne.</p>';
    return `<div class="table-wrap"><table class="sql-result"><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${r.rows.slice(0, 50).map(row => `<tr>${row.map(v => `<td>${v == null ? '<span class="muted">NULL</span>' : esc(typeof v === 'number' ? Math.round(v * 100) / 100 : v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">${plural(r.rows.length, 'ligne')}</p>`;
  };

  // ---------- Progression ----------
  const getProg = s => store.get(progKey(s), {});
  const setDone = (s, id, v) => { const p = getProg(s); p[id] = v; store.set(progKey(s), p); };
  const stepStats = (s, step) => {
    const exos = step.blocks.filter(b => b.t === 'exo');
    const p = getProg(s);
    return { total: exos.length, done: exos.filter(e => p[e.id] === 1).length };
  };
  App.parcoursStats = s => {
    if (!s.parcours) return null;
    let total = 0, done = 0;
    s.parcours.steps.forEach(st => { const x = stepStats(s, st); total += x.total; done += x.done; });
    return { total, done, steps: s.parcours.steps.length };
  };

  // ---------- Liste des étapes ----------
  function renderList(subject) {
    const { steps } = subject.parcours;
    const parts = [...new Set(steps.map(s => s.part))];
    const next = steps.find(st => { const x = stepStats(subject, st); return x.done < x.total; }) || steps[0];
    const all = App.parcoursStats(subject);
    App.mount(subject, 'parcours', `
      <section class="prio-intro">
        <p class="lead">Révision pas à pas, en partant de zéro : explication simple, exemple commenté, puis exercices où tu écris toi-même. Les requêtes SQL s’exécutent pour de vrai et sont vérifiées automatiquement.</p>
        <div class="row wrap">
          <a class="btn primary" href="#/s/${subject.id}/parcours/${next.id}">${all.done ? '▶ Reprendre' : '▶ Commencer'} : ${esc(next.title.replace(/^Étape \d+ — /, ''))}</a>
          <span class="muted small">${all.done}/${all.total} exercices réussis</span>
        </div>
      </section>
      ${parts.map(part => `
        <h2>${esc(part)}</h2>
        <div class="steps">
          ${steps.filter(s => s.part === part).map(st => {
            const x = stepStats(subject, st);
            const done = x.total && x.done === x.total;
            return `<a class="card step-card ${done ? 'done' : ''}" href="#/s/${subject.id}/parcours/${st.id}">
              <span class="step-num">${done ? '✓' : st.num}</span>
              <div class="step-body"><h3>${esc(st.title.replace(/^Étape \d+ — /, ''))}</h3>
                <div class="bar"><i style="width:${pct(x.done, x.total)}%"></i></div>
                <span class="muted small">${x.done}/${x.total} exercices</span></div>
            </a>`;
          }).join('')}
        </div>`).join('')}`);
  }

  // ---------- Une étape ----------
  function renderStep(subject, stepId) {
    const { steps, data } = subject.parcours;
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx < 0) return App.go(`#/s/${subject.id}/parcours`);
    const step = steps[idx], prev = steps[idx - 1], next = steps[idx + 1];
    const drafts = store.get(draftKey(subject), {});
    const prog = getProg(subject);
    const hasSql = step.blocks.some(b => b.sql);
    let n = 0;

    const html = step.blocks.map(b => {
      if (b.t === 'md') return `<div class="md">${markdown(b.md, subject.base)}</div>`;
      n++;
      const st = prog[b.id];
      if (b.trous) {
        let k = 0;
        const saved = (() => { try { return JSON.parse(drafts[b.id] || '[]'); } catch { return []; } })();
        const prompt = markdown(b.prompt, subject.base).replace(/_{5,}/g, () => {
          const i = k++, w = Math.max(5, ...(b.trous[i] || ['']).map(x => x.length)) + 2;
          return `<input class="blank" data-i="${i}" size="${w}" spellcheck="false" autocomplete="off" aria-label="Blanc ${i + 1}" placeholder="${i + 1}" value="${esc(saved[i] || '')}">`;
        });
        return `
        <div class="card exo ${st === 1 ? 'ok' : ''}" data-exo="${b.id}">
          <div class="exo-head"><span class="exo-num">Exercice ${n}</span><span class="tag theme">Code à trous · vérifié</span>${st === 1 ? '<span class="tag ok-tag">✓ réussi</span>' : ''}</div>
          <div class="md trous">${prompt}</div>
          <div class="row wrap exo-actions">
            <button class="btn primary small" data-act="trous">✓ Vérifier</button>
            <button class="btn ghost small" data-act="show">Voir la correction</button>
            <span class="muted small">Remplis chaque case, puis <kbd>Entrée</kbd></span>
          </div>
          <div class="exo-out"></div>
          <div class="exo-solution" hidden><div class="answer"><div class="answer-head">Correction</div><div class="md">${markdown(b.solution, subject.base)}</div></div></div>
        </div>`;
      }
      return `
        <div class="card exo ${st === 1 ? 'ok' : ''}" data-exo="${b.id}">
          <div class="exo-head"><span class="exo-num">Exercice ${n}</span>${b.sql ? '<span class="tag theme">SQL exécutable</span>' : ''}${st === 1 ? '<span class="tag ok-tag">✓ réussi</span>' : ''}</div>
          <div class="md">${markdown(b.prompt, subject.base)}</div>
          <textarea class="draft code-input" rows="${b.sql ? 5 : 7}" spellcheck="false" placeholder="${b.sql ? 'Écris ta requête ici…  (Ctrl + Entrée pour exécuter)' : 'Écris ta réponse ici, avant de regarder la correction…'}">${esc(drafts[b.id] || '')}</textarea>
          <div class="row wrap exo-actions">
            ${b.sql ? `<button class="btn small" data-act="run">▶ Exécuter</button><button class="btn primary small" data-act="check">✓ Vérifier</button>` : ''}
            <button class="btn ghost small" data-act="show">Voir la correction</button>
          </div>
          <div class="exo-out"></div>
          <div class="exo-solution" hidden>
            <div class="answer"><div class="answer-head">Correction</div><div class="md">${markdown(b.solution, subject.base)}</div></div>
            ${b.sql ? '' : `<div class="grade-row"><span class="muted small">Tu avais trouvé ?</span>
              <button class="btn small grade good ${st === 1 ? 'on' : ''}" data-act="self" data-v="1">✓ Oui</button>
              <button class="btn small grade bad ${st === 0 ? 'on' : ''}" data-act="self" data-v="0">✗ Pas encore</button></div>`}
          </div>
        </div>`;
    }).join('');

    const x = stepStats(subject, step);
    const view = App.mount(subject, 'parcours', `
      <div class="row fiche-nav">
        <a class="back" href="#/s/${subject.id}/parcours">← Toutes les étapes</a>
        <span class="spacer"></span>
        <span class="muted small" id="step-prog">${x.done}/${x.total} exercices réussis</span>
      </div>
      <article class="card md-host parcours-step">
        <span class="tag">${esc(step.part)} · étape ${idx + 1}/${steps.length}</span>
        <h2 class="fiche-title">${esc(step.title)}</h2>
        ${hasSql && data ? `<details class="context tables-box"><summary>📋 Tables disponibles (clique pour voir les colonnes et les données)</summary><div id="tables">Chargement…</div></details>` : ''}
        ${html}
      </article>
      <div class="row center finish-row">
        ${prev ? `<a class="btn" href="#/s/${subject.id}/parcours/${prev.id}">← ${esc(prev.title.replace(/^Étape \d+ — /, ''))}</a>` : ''}
        ${next ? `<a class="btn primary" href="#/s/${subject.id}/parcours/${next.id}">${esc(next.title.replace(/^Étape \d+ — /, ''))} →</a>` : `<a class="btn primary" href="#/s/${subject.id}/exam">Fini ! Passer un examen blanc →</a>`}
      </div>`);

    const refreshProg = () => { const y = stepStats(subject, step); $('#step-prog', view).textContent = `${y.done}/${y.total} exercices réussis`; };

    // Encadré des tables : structure et données, chargées à l'ouverture.
    const box = $('.tables-box', view);
    if (box) box.addEventListener('toggle', async () => {
      if (!box.open || box.dataset.loaded) return;
      box.dataset.loaded = '1';
      try {
        const SQL = await loadEngine();
        const db = new SQL.Database(); db.run(data);
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY rowid")[0].values.map(r => r[0]);
        $('#tables', view).innerHTML = tables.map(t => {
          const cols = db.exec(`PRAGMA table_info("${t}")`)[0].values.map(c => `${c[1]}${c[5] ? ' 🔑' : ''}`);
          const rows = db.exec(`SELECT * FROM "${t}"`)[0];
          return `<details class="table-item"><summary><strong>${t === 'order' ? '"order"' : esc(t)}</strong> (${cols.map(esc).join(', ')}) <span class="muted small">· ${plural(rows.values.length, 'ligne')}</span></summary>
            ${resultTable({ columns: rows.columns, rows: rows.values })}</details>`;
        }).join('');
        db.close();
      } catch (e) {
        $('#tables', view).innerHTML = `<p class="muted small">${esc(e.message)}</p><pre class="code"><code>${esc(data)}</code></pre>`;
      }
    });

    // Exercices
    $$('.exo', view).forEach(card => {
      const b = step.blocks.find(x => x.id === card.dataset.exo);
      const ta = $('textarea', card), out = $('.exo-out', card);
      const markOk = () => {
        setDone(subject, b.id, 1);
        card.classList.add('ok');
        if (!$('.ok-tag', card)) $('.exo-head', card).insertAdjacentHTML('beforeend', '<span class="tag ok-tag">✓ réussi</span>');
        refreshProg();
      };
      let saveT;
      const saveDraft = v => { clearTimeout(saveT); saveT = setTimeout(() => { const d = store.get(draftKey(subject), {}); d[b.id] = v; store.set(draftKey(subject), d); }, 300); };
      if (b.trous) {
        const inputs = $$('input.blank', card);
        const norm = v => { v = v.trim().replace(/\s+/g, ' ').replace(/;$/, ''); return b.nocase ? v.toLowerCase() : v; };
        const check = () => {
          clearTimeout(saveT);
          const d = store.get(draftKey(subject), {}); d[b.id] = JSON.stringify(inputs.map(x => x.value)); store.set(draftKey(subject), d);
          let ok = 0;
          inputs.forEach((inp, i) => {
            const good = (b.trous[i] || []).some(alt => norm(alt) === norm(inp.value));
            inp.classList.toggle('good', good); inp.classList.toggle('bad', !good);
            if (good) ok++;
          });
          if (ok === inputs.length) { out.innerHTML = `<div class="feedback-box good"><div class="feedback">✓ Parfait, ${inputs.length}/${inputs.length} !</div></div>`; markOk(); }
          else out.innerHTML = `<div class="feedback-box bad"><div class="feedback">${ok}/${inputs.length} cases justes</div><p class="explain">Les cases en rouge sont à revoir${b.nocase ? '' : ' (attention aux majuscules)'}. Réessaie avant de regarder la correction.</p></div>`;
        };
        inputs.forEach(inp => {
          inp.oninput = () => { inp.classList.remove('good', 'bad'); saveDraft(JSON.stringify(inputs.map(x => x.value))); };
          inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
        });
        $('[data-act=trous]', card).onclick = check;
        $('[data-act=show]', card).onclick = () => { const sol = $('.exo-solution', card); sol.hidden = !sol.hidden; $('[data-act=show]', card).textContent = sol.hidden ? 'Voir la correction' : 'Masquer la correction'; };
        return;
      }
      ta.oninput = () => { clearTimeout(saveT); saveT = setTimeout(() => { const d = store.get(draftKey(subject), {}); d[b.id] = ta.value; store.set(draftKey(subject), d); }, 300); };
      ta.onkeydown = e => {
        if (e.key === 'Tab') { e.preventDefault(); const p = ta.selectionStart; ta.setRangeText('    ', p, ta.selectionEnd, 'end'); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && b.sql) { e.preventDefault(); act('run'); }
      };
      const act = async a => {
        if (a === 'show') { const sol = $('.exo-solution', card); sol.hidden = !sol.hidden; $('[data-act=show]', card).textContent = sol.hidden ? 'Voir la correction' : 'Masquer la correction'; return; }
        const sql = ta.value.trim();
        if (!sql) { out.innerHTML = '<p class="feedback bad">Écris d’abord ta requête 🙂</p>'; return; }
        out.innerHTML = '<p class="muted small">Exécution…</p>';
        try {
          const mine = await runSql(data, sql, b.verify);
          if (a === 'run') { out.innerHTML = resultTable(mine); return; }
          const ref = await runSql(data, b.code, b.verify);
          const diff = sameResult(mine, ref, b.ordered);
          if (!diff) { out.innerHTML = `<div class="feedback-box good"><div class="feedback">✓ Bravo, c’est le bon résultat !</div></div>${resultTable(mine)}`; markOk(); }
          else out.innerHTML = `<div class="feedback-box bad"><div class="feedback">✗ Pas encore</div><p class="explain">${esc(diff)}</p></div>
            <details class="more"><summary>Comparer les résultats</summary><div class="grid-2"><div><strong class="small">Ton résultat</strong>${resultTable(mine)}</div><div><strong class="small">Résultat attendu</strong>${resultTable(ref)}</div></div></details>`;
        } catch (e) {
          out.innerHTML = `<div class="feedback-box bad"><div class="feedback">Erreur SQL</div><p class="explain"><code>${esc(e.message)}</code></p>
            <p class="muted small">Vérifie les apostrophes autour du texte, les virgules entre les colonnes, l’orthographe des tables et des colonnes, et les guillemets de "order".</p></div>`;
        }
      };
      $$('[data-act]', card).forEach(btn => (btn.onclick = () => {
        if (btn.dataset.act === 'self') {
          const v = Number(btn.dataset.v);
          setDone(subject, b.id, v);
          $$('[data-act=self]', card).forEach(x => x.classList.toggle('on', x === btn));
          if (v === 1) markOk(); else { card.classList.remove('ok'); $('.ok-tag', card)?.remove(); refreshProg(); }
          return;
        }
        act(btn.dataset.act);
      }));
    });
  }

  App.views.parcours = { render: ({ subject, parts }) => (!subject.parcours ? App.go(`#/s/${subject.id}`) : parts[0] ? renderStep(subject, parts[0]) : renderList(subject)) };
})();
