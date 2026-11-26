/* ==========================================================
   Bifröst — le pont entre l'app et La Serre
   Traduit les données de l'app (objet D) en notes Markdown
   dans « 05 Bifröst », et relit ces notes pour reconstruire D.
   Ce que Kévin modifie dans Obsidian (routines, jours, à faire,
   semaine, sport, objectifs, livres, carnet) est relu par l'app.
   ========================================================== */
(function (root) {
  'use strict';

  const BASE = '05 Bifröst';
  const WDS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const WDN = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const TYPES = { time: 'temps', check: 'coche', count: 'nombre', measure: 'mesure' };
  const FREQS = { days: 'jours', weekly: 'semaine', monthly: 'mois' };
  const BOOK = { todo: 'à lire', reading: 'en cours', done: 'terminé' };
  const HORIZ = { mois: 'ce mois-ci', trim: 'ce trimestre', annee: 'cette année', libre: 'sans échéance' };
  const QUADS = [
    [1, '🔥 Faire maintenant', 'urgent et important'],
    [2, '🌿 Planifier', 'important, pas urgent'],
    [3, '⚡ Expédier', 'urgent, pas important'],
    [4, '🌙 Plus tard', 'ni urgent ni important'],
    [0, '📥 À classer', ''],
  ];
  const TLOG = [['seen', 'Ce qu\'on a vu'], ['hw', 'Le devoir'], ['res', 'Le résultat']];
  const TLOOP = [['diff', 'Difficulté'], ['fail', 'Ce qui a raté'], ['thought', 'La pensée qui a suivi'], ['avoid', 'Ce que j\'ai évité ensuite']];
  const TRULE = [['rythme', 'Rythme des séances'], ['decroche', 'Si je décroche'], ['medecin', 'Quand j\'appelle un médecin'], ['femme', 'Ma femme dans le programme']];
  const JQ = [['win', "Une chose réussie aujourd'hui"], ['grat', 'Merci pour…'], ['note', 'Note libre']];
  // Données gardées seulement sur l'appareil (jamais dans le coffre)
  const LOCAL_ONLY = ['timer'];
  // Champs rangés dans leurs propres notes
  const HANDLED = ['habits', 'logs', 'measures', 'focus', 'journal', 'sessions', 'themes', 'backlog', 'doneTodos', 'programs', 'curProg', 'goals', 'books', 'notes', 'tcc', 'favs'];

  const inv = o => Object.fromEntries(Object.entries(o).map(([a, b]) => [b, a]));
  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const wd = d => (d.getDay() + 6) % 7;
  const longDate = k => { const d = fromKey(k); return `${WDN[wd(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const hhmm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const isKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
  // Noms de fichiers valides sous Windows, iOS et Obsidian
  const fname = s => (String(s || 'Sans titre').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '') || 'Sans titre').slice(0, 90);
  const lines = s => String(s ?? '').replace(/\r/g, '');
  // Un texte libre ne doit pas créer de faux titres dans la note
  const safeText = s => lines(s).split('\n').map(l => /^#{1,6}\s/.test(l) ? '\\' + l : l).join('\n').trim();
  const unsafeText = s => lines(s).split('\n').map(l => /^\\#{1,6}\s/.test(l) ? l.slice(1) : l).join('\n').trim();

  /* ---------- YAML minimal (le sous-ensemble qu'Obsidian écrit) ---------- */
  function yScalar(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^[\p{L}\p{N}\p{Extended_Pictographic}][\p{Extended_Pictographic}\uFE0F\u200D\p{L}\p{N} _,.'’()…%+\-–—×\/!?]*$/u.test(s) && !/^(true|false|null|yes|no|\d[\d.\-]*)$/i.test(s) && !/: |\s#/.test(s) && !/[ ]$/.test(s)) return s;
    return JSON.stringify(s);
  }
  function yaml(obj) {
    const out = ['---'];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        if (!v.length) out.push(`${k}: []`);
        else { out.push(`${k}:`); v.forEach(x => out.push(`  - ${yScalar(x)}`)); }
      } else out.push(`${k}: ${yScalar(v)}`.replace(/: $/, ':'));
    }
    out.push('---');
    return out.join('\n');
  }
  function yParseScalar(s) {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if (s.startsWith('"') && s.endsWith('"')) { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } }
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      const parts = []; let cur = '', q = '';
      for (const ch of inner) {
        if (q) { cur += ch; if (ch === q) q = ''; }
        else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
        else if (ch === ',') { parts.push(cur); cur = ''; }
        else cur += ch;
      }
      parts.push(cur);
      return parts.map(yParseScalar);
    }
    return s;
  }
  function splitNote(text) {
    text = lines(text);
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) return { fm: {}, body: text };
    const fm = {}; let key = null;
    for (const raw of m[1].split('\n')) {
      if (!raw.trim()) continue;
      const li = raw.match(/^\s+-\s?(.*)$/);
      if (li && key) { if (!Array.isArray(fm[key])) fm[key] = []; fm[key].push(yParseScalar(li[1])); continue; }
      const kv = raw.match(/^([^:]+?):(?:\s(.*)|)$/);
      if (kv) { key = kv[1].trim(); const v = kv[2] === undefined ? '' : kv[2]; fm[key] = v.trim() === '' ? null : yParseScalar(v); }
    }
    return { fm, body: text.slice(m[0].length) };
  }
  // Découpe un corps de note en sections « ## Titre »
  function sections(body, level = 2) {
    const re = new RegExp(`^${'#'.repeat(level)} (.+)$`);
    const out = {}; let cur = null, buf = [];
    for (const l of lines(body).split('\n')) {
      const m = l.match(re);
      if (m) { if (cur !== null) out[cur] = buf.join('\n'); cur = m[1].trim(); buf = []; }
      else if (cur !== null) buf.push(l);
    }
    if (cur !== null) out[cur] = buf.join('\n');
    return out;
  }
  const findSec = (secs, word) => { const k = Object.keys(secs).find(x => x.toLowerCase().includes(word)); return k === undefined ? null : secs[k]; };
  function table(text) {
    const rows = lines(text).split('\n').filter(l => /^\s*\|/.test(l)).map(l => l.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')));
    return rows.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c))).slice(1);
  }
  const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const tasks = text => lines(text).split('\n').map(l => l.match(/^\s*[-*] \[( |x|X)\] (.*)$/)).filter(Boolean).map(m => ({ done: m[1] !== ' ', text: m[2].trim() }));
  const extra = (o, known) => { const r = {}; for (const k of Object.keys(o)) if (!known.includes(k)) r[k] = o[k]; return Object.keys(r).length ? JSON.stringify(r) : undefined; };
  const unextra = s => { if (!s) return {}; try { return typeof s === 'string' ? JSON.parse(s) : {}; } catch (e) { return {}; } };
  const today = () => dkey(new Date());
  // Images rangées dans 30 Remise/Images (sport-<clé>.webp, livre-*.webp)
  let IMG = new Set();
  const imgFile = k => /^livre-/.test(k) ? `${k}.webp` : `sport-${k}.webp`;
  const embed = (k, w) => k && IMG.has(k) ? `![[${imgFile(k)}\\|${w}]]` : '';
  const unembed = c => { const m = String(c || '').match(/!\[\[(?:sport-)?([^\]|\\]+?)\.webp/); return m ? m[1] : String(c || '').trim(); };

  /* ========================================================
     D → notes
     ======================================================== */
  function serialize(D, opts = {}) {
    const files = {};
    const created = opts.created || {};   // date de création déjà connue, par chemin
    const born = p => created[p] || today();
    const put = (p, fm, body) => { const { type, créé, avis, ...rest } = fm; files[p] = yaml({ type, créé: créé || born(p), avis: avis ?? null, ...rest }) + '\n' + body.trim().replace(/\n{3,}/g, '\n\n') + '\n'; };
    const prev = opts.prevFm || {};       // propriétés existantes (on garde l'avis de Kévin)
    const keep = (p, fm) => { const o = prev[p] || {}; return { ...fm, créé: o.créé || fm.créé, avis: o.avis ?? null }; };
    const habits = D.habits || [];
    const used = new Set();
    const uniq = (dir, name) => { let p = `${BASE}/${dir}/${fname(name)}.md`, i = 2; while (used.has(p)) p = `${BASE}/${dir}/${fname(name)} (${i++}).md`; used.add(p); return p; };

    /* --- Routines --- */
    habits.forEach((h, i) => {
      const p = uniq('Routines', h.name);
      const fm = keep(p, {
        type: 'routine', id: h.id, icône: h.icon, couleur: h.color,
        mesure: TYPES[h.type] || h.type, objectif: h.target,
        fréquence: FREQS[h.freq] || h.freq,
        jours: h.freq === 'days' ? (h.days || []).map(d => WDS[d]) : undefined,
        fois: h.freq !== 'days' ? h.times : undefined,
        unité: h.unit || undefined, déclencheur: h.cue || undefined,
        archivée: !!h.archived, ordre: i + 1,
        données: extra(h, ['id', 'name', 'icon', 'color', 'type', 'target', 'freq', 'days', 'times', 'unit', 'cue', 'archived']),
      });
      const when = h.freq === 'days' ? ((h.days || []).length === 7 ? 'tous les jours' : (h.days || []).map(d => WDN[d].toLowerCase()).join(', ') || 'aucun jour') : `${h.times || 1} fois par ${FREQS[h.freq] || h.freq}`;
      const what = h.type === 'time' ? `${h.target} min` : h.type === 'count' ? `${h.target} fois` : h.type === 'measure' ? `une mesure${h.unit ? ` (${h.unit})` : ''}` : 'à cocher';
      put(p, fm, `# ${h.name}\n\n> [!pousse] Routine\n> ${what}, ${when}${h.cue ? ` · ${h.cue}` : ''}${h.archived ? '\n> *En pause (archivée).*' : ''}\n`);
    });

    /* --- Jours --- */
    const keys = new Set([...(opts.dayKeys || [])]);
    Object.keys(D.logs || {}).forEach(k => keys.add(k));
    Object.keys(D.focus || {}).forEach(k => keys.add(k));
    Object.keys(D.journal || {}).forEach(k => keys.add(k));
    (D.sessions || []).forEach(s => keys.add(s.k));
    Object.values(D.measures || {}).forEach(m => Object.keys(m || {}).forEach(k => keys.add(k)));
    const byId = Object.fromEntries(habits.map(h => [h.id, h]));
    const names = {}; habits.forEach(h => { names[h.id] = names[h.id] || h.name; });
    // deux routines au même nom : on les distingue
    const seen = {}; habits.forEach(h => { const n = h.name; if (seen[n]) names[h.id] = `${n} (${h.id})`; seen[n] = true; });
    const themes = D.themes || [];
    [...keys].filter(isKey).sort().forEach(k => {
      const p = `${BASE}/Jours/${k}.md`;
      const th = themes[wd(fromKey(k))];
      const fm = { type: 'jour', créé: k, thème: th ? th.name : undefined };
      const row = (D.logs || {})[k] || {};
      const ids = new Set(Object.keys(row));
      Object.entries(D.measures || {}).forEach(([hid, m]) => { if (m && m[k] !== undefined) ids.add(hid); });
      habits.forEach(h => {
        if (!ids.has(h.id)) return;
        const v = row[h.id] || 0, m = ((D.measures || {})[h.id] || {})[k];
        let out;
        if (h.type === 'measure') out = m !== undefined ? m : (v ? 'fait' : undefined);
        else if (h.type === 'check') out = v >= 1 ? true : undefined;
        else out = v ? Math.round(v * 100) / 100 : undefined;
        if (out !== undefined) fm[names[h.id]] = out;
      });
      // traces d'anciennes routines disparues : gardées telles quelles
      Object.keys(row).filter(id => !byId[id]).forEach(id => { fm[id] = row[id]; });
      const f = (D.focus || {})[k];
      if (f && f.text) { fm['chose du jour'] = f.text; fm['chose faite'] = !!f.done; }
      const o = prev[p] || {};
      if (o.avis) fm.avis = o.avis;
      let body = `# ${longDate(k)}\n`;
      const j = (D.journal || {})[k];
      if (j && JQ.some(([q]) => (j[q] || '').trim())) {
        body += `\n## ✍️ Journal\n`;
        JQ.forEach(([q, l]) => { if ((j[q] || '').trim()) body += `\n### ${l}\n${safeText(j[q])}\n`; });
      }
      const ss = (D.sessions || []).filter(s => s.k === k).sort((a, b) => (a.at || 0) - (b.at || 0));
      if (ss.length) {
        body += `\n## 🏋️ Séances\n\n`;
        ss.forEach(s => {
          body += `- ${s.at ? hhmm(s.at) : '--:--'} · ${s.pname || 'Séance'} · ${s.n}/${s.total} · ${s.dur} min${s.partial ? ' · partielle' : ''}\n`;
          (s.ex || []).forEach(e => { body += `  - ${e.name}${e.reps ? ` : ${e.reps}` : ''}\n`; });
        });
      }
      const done = (D.doneTodos || []).filter(d => d.doneAt === k);
      if (done.length) body += `\n## ✅ Fait\n\n${done.map(d => `- ${d.text}`).join('\n')}\n`;
      put(p, fm, body);
    });

    /* --- Semaine --- */
    put(`${BASE}/Semaine.md`, keep(`${BASE}/Semaine.md`, { type: 'semaine' }),
      `# La semaine à thèmes\n\n| Jour | Thème | Règle du jour | Couleur |\n|---|---|---|---|\n${themes.map((t, i) => `| ${WDN[i]} | ${cell(t.name)} | ${cell(t.note)} | ${cell(t.color)} |`).join('\n')}\n`);

    /* --- À faire (matrice d'Eisenhower) --- */
    const bl = D.backlog || [];
    let todo = `# À faire\n\n> [!conseil] La matrice\n> Une case par ligne. Tu peux ajouter, cocher ou déplacer une tâche ici ou dans Bifröst.\n`;
    QUADS.forEach(([q, name, sub]) => {
      const items = bl.filter(b => (b.q || 0) === q);
      todo += `\n## ${name}\n${sub ? `*${sub}*\n` : ''}\n${items.map(b => `- [ ] ${b.text}`).join('\n')}\n`;
    });
    const dt = D.doneTodos || [];
    todo += `\n## ✅ Fait\n\n${dt.map(d => `- [x] ${d.text} ✅ ${d.doneAt || ''}`.trim() + (d.q ? ` 〔${d.q}〕` : '')).join('\n')}\n`;
    put(`${BASE}/À faire.md`, keep(`${BASE}/À faire.md`, { type: 'à faire' }), todo);

    /* --- Sport --- */
    (D.programs || []).forEach(pr => {
      const p = uniq('Sport', pr.name);
      const fm = keep(p, { type: 'programme', id: pr.id, couleur: pr.color, actuel: D.curProg === pr.id, données: extra(pr, ['id', 'name', 'color', 'exercises']) });
      put(p, fm, `# ${pr.name}\n\n| Exercice | Séries | Clé | Image |\n|---|---|---|---|\n${(pr.exercises || []).map(e => `| ${cell(e.name)} | ${cell(e.reps)} | ${cell(e.id)} | ${embed(e.id, 60)} |`).join('\n')}\n`);
    });

    /* --- Objectifs --- */
    (D.goals || []).forEach(g => {
      const p = uniq('Objectifs', g.title);
      const fm = keep(p, { type: 'objectif', id: g.id, horizon: HORIZ[g.horizon] || g.horizon, couleur: g.color, atteint: !!g.done, créé: g.at ? dkey(new Date(g.at)) : undefined, données: extra(g, ['id', 'title', 'why', 'horizon', 'color', 'steps', 'done', 'at']) });
      put(p, fm, `# ${g.title}\n\n## Pourquoi\n\n${safeText(g.why) || ''}\n\n## Étapes\n\n${(g.steps || []).map(s => `- [${s.done ? 'x' : ' '}] ${s.text}`).join('\n')}\n`);
    });

    /* --- Livres --- */
    put(`${BASE}/Livres.md`, keep(`${BASE}/Livres.md`, { type: 'livres' }),
      `# Livres\n\n| Titre | Statut | Progression | Image |\n|---|---|---|---|\n${(D.books || []).map(b => `| ${cell(b.title)} | ${BOOK[b.status] || b.status} | ${b.progress || 0} % | ${embed(b.img, 50) || cell(b.img || '')} |`).join('\n')}\n`);

    /* --- Carnet (notes libres) --- */
    const notes = [...(D.notes || [])].sort((a, b) => (a.at || 0) - (b.at || 0));
    put(`${BASE}/Carnet.md`, keep(`${BASE}/Carnet.md`, { type: 'carnet' }),
      `# Carnet\n\n${notes.map(n => `### ${n.at ? `${dkey(new Date(n.at))} ${hhmm(n.at)}` : 'Sans date'}${n.pin ? ' 📌' : ''}\n\n${safeText(n.text)}\n`).join('\n')}`);

    /* --- Favoris (liens vers La Serre) --- */
    if (D.favs) put(`${BASE}/Favoris.md`, keep(`${BASE}/Favoris.md`, { type: 'favoris' }),
      `# Favoris\n\n> [!conseil] Sous la main dans Bifröst\n> Une note par ligne, en lien Obsidian. Elles s'affichent dans l'onglet La Serre de Bifröst.\n\n${D.favs.map(f => `- [[${f}]]`).join('\n')}\n`);

    /* --- TCC (lisible et modifiable dans Obsidian) --- */
    if (D.tcc) {
      const t = D.tcc, hw = t.hw;
      const fm = keep(`${BASE}/TCC.md`, {
        type: 'tcc', séance: t.session ?? 0,
        'devoir depuis': hw ? hw.since : undefined,
        'devoir fait': hw ? Object.keys(hw.days || {}).filter(k => hw.days[k]).sort() : undefined,
        données: extra(t, ['session', 'hw', 'log', 'loop', 'asrs', 'rules']),
      });
      let body = `# Carnet TCC\n\n> [!conseil] Modifiable ici ou dans Bifröst\n> Garde les titres tels quels : Bifröst s'en sert pour relire la note.\n`;
      body += `\n## 📌 Le devoir de la semaine\n\n${hw ? safeText(hw.text) : ''}\n`;
      body += `\n## 📓 Journal des séances\n`;
      (t.log || []).forEach(l => {
        body += `\n### ${l.date || 'Sans date'} · séance ${l.n ?? 0}\n`;
        TLOG.forEach(([f, lab]) => { if ((l[f] || '').trim()) body += `\n#### ${lab}\n${safeText(l[f])}\n`; });
      });
      body += `\n## 🔁 Ma boucle\n`;
      (t.loop || []).forEach(x => {
        body += `\n### ${(x.ex || 'Exemple').replace(/\n/g, ' ')}\n`;
        TLOOP.forEach(([f, lab]) => { if ((x[f] || '').trim()) body += `\n#### ${lab}\n${safeText(x[f])}\n`; });
      });
      body += `\n## 🤝 Nos règles\n`;
      TRULE.forEach(([f, lab]) => { body += `\n### ${lab}\n${safeText((t.rules || {})[f] || '')}\n`; });
      body += `\n## 📏 Mesure ASRS\n\n${(t.asrs || []).map(q => `- ${q.date || ''} · total ${q.total ?? ''} · partie A ${q.a ?? ''} · réponses ${(q.ans || []).join(' ')}`).join('\n')}\n`;
      put(`${BASE}/TCC.md`, fm, body);
    }

    /* --- Réglages (le reste) --- */
    const rest = {};
    for (const k of Object.keys(D)) if (!HANDLED.includes(k) && !LOCAL_ONLY.includes(k) && !k.startsWith('_')) rest[k] = D[k];
    put(`${BASE}/Réglages.md`, keep(`${BASE}/Réglages.md`, { type: 'réglages' }),
      `# Réglages de Bifröst\n\n> [!conseil] Lecture seule\n> Les réglages techniques de l'app (respiration, ambiances, début de journée…). À changer depuis l'app.\n\n> [!compost]- Données de l'app\n> \`\`\`json\n${JSON.stringify(rest, null, 1).split('\n').map(l => '> ' + l).join('\n')}\n> \`\`\`\n`);

    return files;
  }

  /* ========================================================
     notes → D
     ======================================================== */
  function jsonBlock(body) {
    const m = lines(body).match(/```json\n([\s\S]*?)\n> ?```/);
    if (!m) return null;
    try { return JSON.parse(m[1].split('\n').map(l => l.replace(/^> ?/, '')).join('\n')); } catch (e) { return null; }
  }
  const title = (body, fallback) => { const m = lines(body).match(/^# (.+)$/m); return m ? m[1].trim() : fallback; };
  const stem = p => p.split('/').pop().replace(/\.md$/, '');
  let uidN = 0;
  const uid = pfx => pfx + Date.now().toString(36).slice(-4) + (uidN++).toString(36);

  function parse(files) {
    const D = {};
    const prevFm = {}, created = {};
    const notes = Object.entries(files).filter(([p]) => p.startsWith(BASE + '/') && p.endsWith('.md'))
      .map(([p, text]) => { const n = splitNote(text); prevFm[p] = n.fm; if (n.fm.créé) created[p] = String(n.fm.créé); return { p, ...n }; });
    const inDir = d => notes.filter(n => n.p.startsWith(`${BASE}/${d}/`));
    const one = name => notes.find(n => n.p === `${BASE}/${name}.md`);

    /* --- Réglages --- */
    const reg = one('Réglages');
    Object.assign(D, (reg && jsonBlock(reg.body)) || {});

    /* --- Routines --- */
    const FREQ_IN = inv(FREQS), TYPE_IN = inv(TYPES);
    D.habits = inDir('Routines').map(n => {
      const f = n.fm;
      const freq = FREQ_IN[f.fréquence] || f.fréquence || 'days';
      const jours = Array.isArray(f.jours) ? f.jours : (f.jours ? String(f.jours).split(/[,\s]+/) : []);
      const h = {
        ...unextra(f.données),
        id: f.id || uid('h_'), name: title(n.body, stem(n.p)), icon: f.icône || 'star', color: f.couleur || '#3CCFC0',
        type: TYPE_IN[f.mesure] || f.mesure || 'check', target: Number(f.objectif) || 1, freq,
        days: freq === 'days' ? jours.map(x => WDS.indexOf(String(x).toLowerCase().slice(0, 3))).filter(x => x >= 0).sort() : [],
        archived: f.archivée === true,
      };
      if (freq !== 'days') h.times = Number(f.fois) || 1;
      if (f.unité) h.unit = String(f.unité);
      if (f.déclencheur) h.cue = String(f.déclencheur);
      h._ordre = Number(f.ordre) || 999;
      return h;
    }).sort((a, b) => a._ordre - b._ordre).map(h => { delete h._ordre; return h; });

    /* --- Jours --- */
    const byName = {}; D.habits.forEach(h => { byName[h.name] = byName[h.name] || h; byName[`${h.name} (${h.id})`] = h; byName[h.id] = h; });
    const SKIP = ['type', 'créé', 'avis', 'thème', 'chose du jour', 'chose faite', 'tags', 'aliases', 'cssclasses'];
    D.logs = {}; D.measures = {}; D.focus = {}; D.journal = {}; D.sessions = [];
    const doneByDay = {};
    const progs = {};
    inDir('Jours').forEach(n => {
      const k = stem(n.p); if (!isKey(k)) return;
      const f = n.fm;
      for (const [key, v] of Object.entries(f)) {
        if (SKIP.includes(key) || v === null || v === false || v === '') continue;
        const h = byName[key];
        if (!h) { if (typeof v === 'number') (D.logs[k] = D.logs[k] || {})[key] = v; continue; }
        if (h.type === 'measure') {
          if (typeof v === 'number') (D.measures[h.id] = D.measures[h.id] || {})[k] = v;
          (D.logs[k] = D.logs[k] || {})[h.id] = 1;
        } else {
          const num = v === true ? (h.type === 'check' ? 1 : h.target) : Number(v);
          if (num > 0) (D.logs[k] = D.logs[k] || {})[h.id] = num;
        }
      }
      if (f['chose du jour']) D.focus[k] = { text: String(f['chose du jour']), done: f['chose faite'] === true };
      const secs = sections(n.body);
      const js = findSec(secs, 'journal');
      if (js) {
        const sub = sections(js, 3), e = {};
        JQ.forEach(([q, l]) => { if (sub[l] !== undefined) e[q] = unsafeText(sub[l]); });
        if (JQ.some(([q]) => (e[q] || '').trim())) D.journal[k] = e;
      }
      const ss = findSec(secs, 'séance');
      if (ss) {
        let cur = null;
        lines(ss).split('\n').forEach(l => {
          const m = l.match(/^- (\d\d:\d\d|--:--) · (.+?) · (\d+)\/(\d+) · (\d+) min( · partielle)?\s*$/);
          if (m) {
            const [hh, mm] = m[1] === '--:--' ? [12, 0] : m[1].split(':').map(Number);
            const d = fromKey(k); d.setHours(hh, mm, 0, 0);
            cur = { id: 's' + k.replace(/-/g, '') + m[1].replace(/\D/g, '') + D.sessions.length, k, at: d.getTime(), pid: null, pname: m[2], n: Number(m[3]), total: Number(m[4]), dur: Number(m[5]), partial: !!m[6], ex: [] };
            D.sessions.push(cur);
            return;
          }
          const e = l.match(/^\s+- (.+?)(?: : (.+))?$/);
          if (e && cur) cur.ex.push({ name: e[1].trim(), reps: (e[2] || '').trim() });
        });
      }
      const fs = findSec(secs, 'fait');
      if (fs) doneByDay[k] = lines(fs).split('\n').map(l => l.match(/^- (.+)$/)).filter(Boolean).map(m => m[1].trim());
    });
    D.sessions.sort((a, b) => b.at - a.at);

    /* --- Semaine --- */
    const sem = one('Semaine');
    if (sem) {
      const rows = table(sem.body);
      D.themes = WDN.map((name, i) => {
        const r = rows.find(x => (x[0] || '').toLowerCase() === name.toLowerCase()) || rows[i] || [];
        return { name: r[1] || '', note: r[2] || '', color: r[3] || '#3CCFC0' };
      });
    }

    /* --- À faire --- */
    const af = one('À faire');
    D.backlog = []; D.doneTodos = [];
    if (af) {
      const secs = sections(af.body);
      for (const [h, txt] of Object.entries(secs)) {
        const low = h.toLowerCase();
        if (low.includes('fait')) {
          tasks(txt).forEach(t => {
            const m = t.text.match(/^(.*?)(?:\s+✅\s*(\d{4}-\d{2}-\d{2}))?(?:\s+〔(\d)〕)?\s*$/);
            D.doneTodos.push({ id: uid('d'), text: m[1].trim(), q: m[3] ? Number(m[3]) : 0, doneAt: m[2] || '' });
          });
          continue;
        }
        const Q = QUADS.find(([, name]) => low.includes(name.slice(name.indexOf(' ') + 1).toLowerCase()));
        const q = Q ? Q[0] : 0;
        tasks(txt).forEach(t => {
          if (t.done) D.doneTodos.unshift({ id: uid('d'), text: t.text.replace(/\s+✅.*$/, ''), q, doneAt: (t.text.match(/✅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || dkey(new Date()) });
          else D.backlog.push(q ? { id: uid('t'), text: t.text, q } : { id: uid('t'), text: t.text });
        });
      }
    }
    // Les jours listent ce qui a été fait : si la ligne manque dans « À faire », on la reprend
    Object.entries(doneByDay).forEach(([k, arr]) => arr.forEach(text => { if (!D.doneTodos.some(d => d.text === text && d.doneAt === k)) D.doneTodos.push({ id: uid('d'), text, q: 0, doneAt: k }); }));
    D.doneTodos.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

    /* --- Sport --- */
    D.programs = inDir('Sport').map(n => {
      const f = n.fm;
      const pr = { ...unextra(f.données), id: f.id || uid('p'), name: title(n.body, stem(n.p)), color: f.couleur || '#3CCFC0', exercises: table(n.body).filter(r => r[0]).map(r => ({ id: r[2] || uid('e'), name: r[0], reps: r[1] || '' })) };
      if (f.actuel === true) D.curProg = pr.id;
      progs[pr.name] = pr.id;
      return pr;
    });
    D.sessions.forEach(s => { s.pid = progs[s.pname] || (D.programs[0] && D.programs[0].id) || null; });
    if (!D.curProg && D.programs[0]) D.curProg = D.programs[0].id;

    /* --- Objectifs --- */
    const HZ_IN = inv(HORIZ);
    D.goals = inDir('Objectifs').map(n => {
      const f = n.fm, secs = sections(n.body);
      const at = f.créé && isKey(String(f.créé)) ? fromKey(String(f.créé)).getTime() : Date.now();
      return { ...unextra(f.données), id: f.id || uid('g'), title: title(n.body, stem(n.p)), why: unsafeText(findSec(secs, 'pourquoi') || ''), horizon: HZ_IN[f.horizon] || f.horizon || 'libre', color: f.couleur || '#3CCFC0', steps: tasks(findSec(secs, 'étape') || '').map((t, i) => ({ id: `s${i}`, text: t.text, done: t.done })), done: f.atteint === true, at };
    });

    /* --- Livres --- */
    const lv = one('Livres');
    const BK_IN = inv(BOOK);
    D.books = lv ? table(lv.body).filter(r => r[0]).map((r, i) => ({ id: `b${i + 1}`, title: r[0], status: BK_IN[(r[1] || '').toLowerCase()] || 'todo', progress: Math.max(0, Math.min(100, parseInt(r[2], 10) || 0)), img: unembed(r[3]) })) : [];

    /* --- Carnet --- */
    const cn = one('Carnet');
    D.notes = [];
    if (cn) {
      Object.entries(sections(cn.body, 3)).forEach(([h, txt], i) => {
        const m = h.match(/^(\d{4}-\d{2}-\d{2})(?: (\d\d):(\d\d))?/);
        let at = Date.now() - 1000 * (100 - i);
        if (m) { const d = fromKey(m[1]); d.setHours(Number(m[2] || 12), Number(m[3] || 0) , i % 60, 0); at = d.getTime(); }
        const t = unsafeText(txt);
        if (t) D.notes.push({ id: 'n' + at.toString(36), text: t, at, upd: at, pin: h.includes('📌') });
      });
    }

    /* --- Favoris --- */
    const fv = one('Favoris');
    if (fv) D.favs = [...lines(fv.body).matchAll(/^\s*[-*] .*?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/gm)].map(m => m[1].trim());

    /* --- TCC --- */
    const tcc = one('TCC');
    if (tcc) {
      const old = jsonBlock(tcc.body);
      if (old) D.tcc = old;   // ancien format (bloc de données)
      else {
        const f = tcc.fm, secs = sections(tcc.body);
        const byLab = (sub, defs) => { const o = {}; defs.forEach(([k, lab]) => { o[k] = sub[lab] !== undefined ? unsafeText(sub[lab]) : ''; }); return o; };
        const t = { ...unextra(f.données), session: Number(f.séance) || 0, hw: null, log: [], loop: [], asrs: [], rules: {} };
        const hwTxt = unsafeText(findSec(secs, 'devoir') || '');
        if (hwTxt) {
          const done = Array.isArray(f['devoir fait']) ? f['devoir fait'] : [];
          t.hw = { text: hwTxt, since: f['devoir depuis'] ? String(f['devoir depuis']) : dkey(new Date()), days: Object.fromEntries(done.map(k => [String(k), true])) };
        }
        Object.entries(sections(findSec(secs, 'journal des séances') || '', 3)).forEach(([h, txt], i) => {
          const m = h.match(/^(\S+)\s*·\s*séance\s*(\d+)/i);
          t.log.push({ id: 'l' + i, date: m && isKey(m[1]) ? m[1] : '', n: m ? Number(m[2]) : 0, ...byLab(sections(txt, 4), TLOG) });
        });
        Object.entries(sections(findSec(secs, 'boucle') || '', 3)).forEach(([h, txt], i) => { t.loop.push({ id: 'x' + i, ex: h, ...byLab(sections(txt, 4), TLOOP) }); });
        t.rules = byLab(sections(findSec(secs, 'règles') || '', 3), TRULE);
        lines(findSec(secs, 'asrs') || '').split('\n').forEach((l, i) => {
          const m = l.match(/^- (\S*) · total (\d*) · partie A (\d*) · réponses ([\d ]*)$/);
          if (m) { const d = isKey(m[1]) ? fromKey(m[1]) : new Date(); d.setHours(12); t.asrs.push({ id: 'q' + i, at: d.getTime(), date: m[1], ans: m[4].trim().split(/\s+/).filter(Boolean).map(Number), a: Number(m[3]), total: Number(m[2]) }); }
        });
        D.tcc = t;
      }
    }

    return { D, prevFm, created, dayKeys: inDir('Jours').map(n => stem(n.p)).filter(isKey) };
  }

  const api = { BASE, serialize, parse, splitNote, yaml, setImages: keys => { IMG = new Set(keys); } };
  if (typeof module !== 'undefined') module.exports = api; else root.Vault = api;
})(typeof window !== 'undefined' ? window : globalThis);
