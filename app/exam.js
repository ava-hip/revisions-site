// Examen blanc : une session complète, chronométrée, puis auto-correction sur le barème.
(() => {
  'use strict';
  const { esc, pct, plural, $, $$, store, record, parseDuration, fmtClock, fmtDate, markdown } = App;

  const draftKey = (subject, s) => `revisions.exam.draft.${subject.id}.${s.id}`;
  const historyKey = subject => `revisions.exams.${subject.id}`;
  const on20 = (score, total) => ((20 * score) / (total || 1)).toFixed(1).replace('.', ',');
  const fmtPts = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const sessionTotal = s => s.total || s.dossiers.reduce((n, d) => n + (d.points || d.questions.reduce((m, q) => m + (q.points || 0), 0)), 0);
  const allQuestions = s => s.dossiers.flatMap((d, di) => d.questions.map(q => ({ q, dossier: d, di, session: s })));

  function render({ subject, parts, params }) {
    const s = parts[0] && subject.sessions.find(x => x.id === parts[0]);
    if (!s) return renderList(subject);
    if (params.get('result')) return renderResult(subject, s, Number(params.get('result')));
    const draft = store.get(draftKey(subject, s), null);
    if (!draft) return renderIntro(subject, s);
    if (draft.phase === 'grading') return renderGrading(subject, s, draft);
    renderWriting(subject, s, draft);
  }

  // ---------- Choix du sujet ----------
  function renderList(subject) {
    const sessions = subject.sessions.filter(s => s.questionCount);
    const history = store.get(historyKey(subject), []);
    const card = s => {
      const mine = history.filter(h => h.session === s.id);
      const ongoing = store.get(draftKey(subject, s), null);
      return `
        <div class="card session-card${s.mock ? ' mock' : ''}">
          <div class="row"><h3>${esc(s.label)}</h3><span class="spacer"></span>${s.duration ? `<span class="muted small">⏱ ${esc(s.duration)}</span>` : ''}</div>
          <p class="muted small">${plural(s.questionCount, 'question')} · ${sessionTotal(s)} points
            ${s.mock ? ` · <span class="badge mock">${esc(s.badge || 'inédit')}</span>` : s.officialAnswers === false ? ' · <span class="badge warn">corrigé non officiel</span>' : ''}</p>
          ${mine.length ? `<p class="small">Dernière note : <strong>${on20(mine[mine.length - 1].score, mine[mine.length - 1].total)}/20</strong>
             · meilleure : ${on20(Math.max(...mine.map(h => h.score)), s.total || mine[0].total)}/20 (${plural(mine.length, 'passage')})</p>` : ''}
          <div class="row wrap">
            <a class="btn ${ongoing ? 'warn' : 'primary'} small" href="#/s/${subject.id}/exam/${s.id}">${ongoing ? (ongoing.phase === 'grading' ? 'Reprendre la correction' : 'Reprendre l’épreuve') : 'Commencer'}</a>
          </div>
        </div>`;
    };
    const mocks = sessions.filter(s => s.mock), official = sessions.filter(s => !s.mock);
    const view = App.mount(subject, 'exam', `
      <div class="intro-text">
        <p>Choisis un sujet et compose en conditions réelles : chronomètre, pas de corrigé pendant l’épreuve.
        À la fin, compare ta copie au corrigé et attribue-toi les points question par question.</p>
      </div>
      <div class="row"><button class="btn primary" id="random">🎲 Sujet au hasard</button><span class="muted small">(de préférence un sujet jamais passé)</span></div>
      ${App.mockSections(mocks, 'Des questions jamais vues, au format de l’examen. Corrigés proposés, non officiels.').map(sec => `
        <h2>${esc(sec.title)}</h2>
        <p class="muted small">${esc(sec.intro)}</p>
        <div class="grid sessions">${sec.sessions.map(card).join('')}</div>`).join('')}
      ${mocks.length && official.length ? '<h2>Annales officielles</h2>' : ''}
      ${official.length ? `<div class="grid sessions">${official.map(card).join('')}</div>` : ''}
      ${history.length ? `
        <h2>Historique</h2>
        <div class="card">
          ${history.slice().reverse().map(h => `
            <div class="prog-row">
              <a href="#/s/${subject.id}/exam/${h.session}?result=${h.at}">${esc(h.label)} — ${fmtDate(h.at)}</a>
              <div class="bar"><i style="width:${pct(h.score, h.total)}%"></i></div>
              <div class="num">${on20(h.score, h.total)}/20</div>
            </div>`).join('')}
        </div>` : ''}`);

    $('#random', view).onclick = () => {
      const done = new Set(history.map(h => h.session));
      const fresh = sessions.filter(s => !done.has(s.id));
      const pool = fresh.length ? fresh : sessions;
      App.go(`#/s/${subject.id}/exam/${pool[Math.floor(Math.random() * pool.length)].id}`);
    };
  }

  // ---------- Consignes ----------
  function renderIntro(subject, s) {
    const minutes = parseDuration(s.duration);
    const view = App.mount(subject, 'exam', `
      <a class="back" href="#/s/${subject.id}/exam">← Tous les sujets</a>
      <div class="card exam-intro">
        <span class="code-chip">Examen blanc</span>
        <h2>${esc(subject.code)} — Session ${esc(s.label)}</h2>
        <p class="muted">${[minutes && `Durée : ${esc(s.duration)}`, `${sessionTotal(s)} points`, plural(s.questionCount, 'question')].filter(Boolean).join(' · ')}</p>
        <table class="bareme"><tbody>
          ${s.dossiers.map((d, i) => `<tr><td>Dossier ${i + 1} — ${esc(d.title)}</td><td class="num">${d.points ?? ''} pts</td></tr>`).join('')}
          <tr class="total"><td>Total</td><td class="num">${sessionTotal(s)} pts</td></tr>
        </tbody></table>
        <ul class="small muted">
          <li>Le chronomètre démarre dès que tu commences. Tu peux dépasser le temps : le dépassement est indiqué.</li>
          <li>Ta copie est enregistrée automatiquement dans ce navigateur : tu peux fermer la page et reprendre.</li>
          <li>À la fin, tu compares ta copie au corrigé et tu t’attribues les points.</li>
        </ul>
        <div class="row">
          <button class="btn primary" id="go">Commencer l’épreuve</button>
          ${s.sujet ? `<a class="btn" ${App.assetAttrs(s.sujet)} target="_blank">Sujet PDF original ↗</a>` : ''}
        </div>
      </div>`);
    $('#go', view).onclick = () => {
      store.set(draftKey(subject, s), { phase: 'writing', startedAt: Date.now(), answers: {}, grades: {} });
      App.refresh();
    };
  }

  // ---------- Composition ----------
  function renderWriting(subject, s, draft) {
    const minutes = parseDuration(s.duration);
    const view = App.mount(subject, 'exam', `
      <div class="exam-bar">
        <div><strong>${esc(s.label)}</strong> <span class="muted small">· ${sessionTotal(s)} pts</span></div>
        <div class="timer" id="timer"></div>
        <button class="btn primary small" id="finish">Terminer et corriger</button>
      </div>
      ${s.intro ? `<div class="card md">${markdown(s.intro, subject.base)}</div>` : ''}
      ${s.dossiers.map((d, di) => `
        <section class="dossier">
          <h2>Dossier ${di + 1} — ${esc(d.title)} <span class="muted small">${d.points ?? ''} pts</span></h2>
          ${d.intro ? `<div class="card md">${markdown(d.intro, subject.base)}</div>` : ''}
          ${d.questions.map(q => `
            <article class="card qblock">
              <div class="qhead"><strong>Question ${q.num}</strong>${q.points != null ? `<span class="tag strong">${fmtPts(q.points)} pts</span>` : ''}</div>
              ${App.questionBody(subject, { q })}
              <textarea class="draft" data-q="${q.id}" rows="5" placeholder="Ta réponse…">${esc(draft.answers[q.id] || '')}</textarea>
            </article>`).join('')}
        </section>`).join('')}
      <div class="row center finish-row">
        <button class="btn" id="abandon">Abandonner cette épreuve</button>
        <button class="btn primary" id="finish2">Terminer et corriger</button>
      </div>`);

    // Chronomètre
    const timer = $('#timer', view);
    const tick = () => {
      const elapsed = (Date.now() - draft.startedAt) / 1000;
      if (!minutes) { timer.textContent = `⏱ ${fmtClock(elapsed)}`; return; }
      const left = minutes * 60 - elapsed;
      timer.textContent = left >= 0 ? `⏱ ${fmtClock(left)} restantes` : `⏰ Temps écoulé ${fmtClock(left)}`;
      timer.className = `timer ${left < 0 ? 'over' : left < 600 ? 'low' : ''}`;
    };
    tick();
    const interval = setInterval(tick, 1000);
    App.onLeave(() => clearInterval(interval));

    // Sauvegarde automatique
    let saveT;
    const save = () => store.set(draftKey(subject, s), draft);
    $$('textarea[data-q]', view).forEach(t => (t.oninput = () => {
      draft.answers[t.dataset.q] = t.value;
      clearTimeout(saveT);
      saveT = setTimeout(save, 300);
    }));
    App.onLeave(() => { clearTimeout(saveT); save(); });

    const finish = btn => () => {
      const empty = allQuestions(s).filter(x => !(draft.answers[x.q.id] || '').trim()).length;
      if (empty && !btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = `${plural(empty, 'question')} sans réponse — confirmer ?`;
        return;
      }
      draft.phase = 'grading';
      draft.finishedAt = Date.now();
      save();
      App.refresh();
    };
    $('#finish', view).onclick = finish($('#finish', view));
    $('#finish2', view).onclick = finish($('#finish2', view));
    const abandon = $('#abandon', view);
    abandon.onclick = () => {
      if (!abandon.dataset.armed) { abandon.dataset.armed = '1'; abandon.textContent = 'Confirmer l’abandon (copie effacée)'; return; }
      clearTimeout(saveT);
      App.onLeave(() => store.del(draftKey(subject, s)));
      App.go(`#/s/${subject.id}/exam`);
    };
  }

  // ---------- Auto-correction ----------
  function renderGrading(subject, s, draft) {
    const items = allQuestions(s);
    const used = draft.finishedAt ? Math.round((draft.finishedAt - draft.startedAt) / 60000) : null;

    const view = App.mount(subject, 'exam', `
      <div class="exam-bar">
        <div><strong>Correction — ${esc(s.label)}</strong>${used != null ? ` <span class="muted small">· composé en ${used} min</span>` : ''}</div>
        <div class="timer" id="total"></div>
        <button class="btn primary small" id="validate">Valider la note</button>
      </div>
      <p class="muted">Pour chaque question, compare ta copie au corrigé et attribue-toi des points. Sois exigeant : c’est ce que fera le correcteur.</p>
      ${s.dossiers.map((d, di) => `
        <section class="dossier">
          <h2>Dossier ${di + 1} — ${esc(d.title)} <span class="muted small" data-dsum="${di}"></span></h2>
          ${d.questions.map(q => {
            const x = { q, session: s, dossier: d };
            const max = q.points ?? 0;
            const answer = (draft.answers[q.id] || '').trim();
            return `
            <article class="card qblock">
              <div class="qhead"><strong>Question ${q.num}</strong><span class="tag strong">${fmtPts(max)} pts</span></div>
              ${App.questionBody(subject, x)}
              <div class="grid-2">
                <div class="mycopy"><div class="answer-head">Ma copie</div>${answer ? `<pre class="copy">${esc(answer)}</pre>` : '<p class="muted">(pas de réponse)</p>'}</div>
                ${App.answerBlock(subject, x)}
              </div>
              <div class="grade-row">
                <span class="muted small">Points obtenus :</span>
                ${[0, 0.25, 0.5, 0.75, 1].map(f => `<button class="btn small quick" data-q="${q.id}" data-v="${max * f}">${f === 0 ? '0' : f === 1 ? 'Tout' : fmtPts(max * f)}</button>`).join('')}
                <input type="number" class="pts" data-q="${q.id}" min="0" max="${max}" step="0.5" value="${draft.grades[q.id] ?? ''}" placeholder="—"> <span class="muted small">/ ${fmtPts(max)}</span>
              </div>
            </article>`;
          }).join('')}
        </section>`).join('')}
      <div class="row center finish-row"><button class="btn primary" id="validate2">Valider la note</button></div>`);

    const total = sessionTotal(s);
    const refreshTotals = () => {
      const graded = items.filter(x => draft.grades[x.q.id] != null);
      const score = graded.reduce((n, x) => n + draft.grades[x.q.id], 0);
      $('#total', view).textContent = `${fmtPts(score)} / ${total} · ${on20(score, total)}/20${graded.length < items.length ? ` · ${items.length - graded.length} à noter` : ''}`;
      s.dossiers.forEach((d, di) => {
        const sc = d.questions.reduce((n, q) => n + (draft.grades[q.id] || 0), 0);
        $(`[data-dsum="${di}"]`, view).textContent = `${fmtPts(sc)} / ${d.points ?? '?'} pts`;
      });
      $$('.quick', view).forEach(b => b.classList.toggle('on', draft.grades[b.dataset.q] === Number(b.dataset.v)));
      store.set(draftKey(subject, s), draft);
    };
    const setGrade = (id, v) => {
      const max = items.find(x => x.q.id === id).q.points ?? 0;
      if (v === '' || v == null || Number.isNaN(Number(v))) delete draft.grades[id];
      else draft.grades[id] = Math.max(0, Math.min(max, Number(v)));
      const input = $(`input.pts[data-q="${id}"]`, view);
      if (document.activeElement !== input) input.value = draft.grades[id] ?? '';
      refreshTotals();
    };
    $$('.quick', view).forEach(b => (b.onclick = () => setGrade(b.dataset.q, b.dataset.v)));
    $$('input.pts', view).forEach(i => { i.oninput = () => setGrade(i.dataset.q, i.value); i.onblur = () => (i.value = draft.grades[i.dataset.q] ?? ''); });
    refreshTotals();

    const validate = btn => () => {
      const missing = items.filter(x => draft.grades[x.q.id] == null).length;
      if (missing && !btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = `${plural(missing, 'question non notée', 'questions non notées')} (= 0) — confirmer ?`;
        return;
      }
      const at = Date.now();
      const score = items.reduce((n, x) => n + (draft.grades[x.q.id] || 0), 0);
      items.forEach(x => {
        const ratio = (draft.grades[x.q.id] || 0) / (x.q.points || 1);
        record(subject, 'annale', x.q.id, ratio >= 0.8 ? 1 : ratio >= 0.3 ? 0.5 : 0);
      });
      const history = store.get(historyKey(subject), []);
      history.push({
        session: s.id, label: s.label, at, score, total,
        minutes: draft.finishedAt ? Math.round((draft.finishedAt - draft.startedAt) / 60000) : null,
        dossiers: s.dossiers.map(d => ({ title: d.title, points: d.points, score: d.questions.reduce((n, q) => n + (draft.grades[q.id] || 0), 0) })),
        grades: draft.grades, answers: draft.answers,
      });
      store.set(historyKey(subject), history);
      store.del(draftKey(subject, s));
      App.go(`#/s/${subject.id}/exam/${s.id}?result=${at}`);
    };
    $('#validate', view).onclick = validate($('#validate', view));
    $('#validate2', view).onclick = validate($('#validate2', view));
  }

  // ---------- Résultat ----------
  function renderResult(subject, s, at) {
    const h = store.get(historyKey(subject), []).find(x => x.at === at);
    if (!h) return App.go(`#/s/${subject.id}/exam`);
    const note = (20 * h.score) / h.total;
    const mood = note >= 16 ? 'Excellent 🎉' : note >= 12 ? 'Bien 👍' : note >= 10 ? 'C’est validé, continue 💪' : 'À retravailler 📖';
    const weak = allQuestions(s).filter(x => (h.grades[x.q.id] || 0) < 0.5 * (x.q.points || 0));

    const view = App.mount(subject, 'exam', `
      <a class="back" href="#/s/${subject.id}/exam">← Examens blancs</a>
      <div class="card result">
        <span class="code-chip">Examen blanc · ${esc(s.label)} · ${fmtDate(h.at)}</span>
        <div class="score">${on20(h.score, h.total)}<small>/20</small></div>
        <div class="muted">${fmtPts(h.score)} / ${h.total} points — ${mood}${h.minutes != null ? ` · ${h.minutes} min` : ''}</div>
        <table class="bareme"><tbody>
          ${h.dossiers.map(d => `<tr><td>${esc(d.title)}</td><td><div class="bar"><i style="width:${pct(d.score, d.points)}%"></i></div></td><td class="num">${fmtPts(d.score)} / ${d.points ?? '?'}</td></tr>`).join('')}
        </tbody></table>
        <div class="row center">
          ${weak.length ? `<button class="btn primary" id="train">S’entraîner sur les ${weak.length} question(s) ratée(s)</button>` : ''}
          <a class="btn" href="#/s/${subject.id}/exam/${s.id}">Repasser ce sujet</a>
          <a class="btn" href="#/s/${subject.id}/annales/${s.id}">Relire le corrigé</a>
        </div>
      </div>
      ${weak.length ? `<h2>Questions à retravailler (moins de la moitié des points)</h2>
        ${weak.map(x => `
          <details class="card qitem">
            <summary><span class="dot bad"></span><div>${App.questionMeta(subject, x, { link: false })}
              <div class="qtitle">Q${x.q.num} — ${fmtPts(h.grades[x.q.id] || 0)} / ${fmtPts(x.q.points)} pts</div></div></summary>
            ${App.questionBody(subject, x)}
            <div class="grid-2">
              <div class="mycopy"><div class="answer-head">Ma copie</div>${(h.answers[x.q.id] || '').trim() ? `<pre class="copy">${esc(h.answers[x.q.id])}</pre>` : '<p class="muted">(pas de réponse)</p>'}</div>
              ${App.answerBlock(subject, x)}
            </div>
          </details>`).join('')}` : ''}`);

    if ($('#train', view)) $('#train', view).onclick = () => App.startTrainWith(subject, weak.map(({ q, session, dossier }) => ({ q, session, dossier })));
  }

  App.views.exam = { render };
})();
