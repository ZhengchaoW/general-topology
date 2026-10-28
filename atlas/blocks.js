import {unsupportedSteps,assumptionUse} from './graph.mjs';
// Shared content blocks (statement, source, relation lists, proof). Each prototype
// composes and styles them differently; the course content itself is identical.
import { esc, math, numberLabel, pdfLink, facsimileHTML, ROLE_LABEL, KIND_LABEL } from './core.js';

export const RULES = {
  source_argument: { symbol: '·', label: 'source passage', long: 'A reading step in the source argument. Reading order alone does not assert a logical dependency.' },
  joint_application: { symbol: '∧', label: 'all of', long: 'Every listed premise is needed together; none is an alternative.' },
  universal_generalization: { symbol: '∀', label: 'generalize', long: 'The set was arbitrary, so the conclusion holds for every closed set. Universal generalization, not Boolean AND.' },
  inverse_function_and_closed_preimage: { symbol: '∧', label: 'all of', long: 'Bijectivity gives the inverse function; closed preimages give its continuity.' },
  introduce_arbitrary_closed_subset: { symbol: '∀', label: 'arbitrary', long: 'Introduce an arbitrary closed subset and open the local scope.' }
};
const ORIGIN = { source_passage_with_editorial_segmentation: 'source passage', editorial_premise_reading: 'editorial premise reading', source_expanded: 'expanded from the source proof', editorial_expansion: 'atlas expansion' };

export const pages = o => `p.${o.page}${o.endPage > o.page ? '–' + o.endPage : ''}`;
export const srcLink = (page, label, cls = 'src') => `<a class="${cls}" href="${pdfLink(page)}" target="_blank" rel="noopener">${esc(label || 'PDF p.' + page)}</a>`;
export const mark = role => `<i class="mark mark-${role}" aria-hidden="true"></i>`;
export const chip = n => `<button class="chip role-${n.role}" data-action="select" data-id="${n.id}" data-hover="${n.id}" title="${esc(n.en)}">${esc(numberLabel(n))}</button>`;
export const entityRow = (n, extra = '') => `<button class="entity" data-action="select" data-id="${n.id}" data-hover="${n.id}">${mark(n.role)}<span class="entity-text"><b>${esc(n.short)}</b><small>${esc(numberLabel(n))}${extra}</small></span></button>`;

// The statement as printed in the notes (source excerpt + facsimile), then the atlas paraphrase.
export function statementBlock(atlas, n, { facsimileOpen = false } = {}) {
  const ex = n.excerpts.filter(x => x.role === 'statement');
  const printed = ex.map(x => `<figure class="source-text"><figcaption><span class="eyebrow">In the notes</span><b>${esc(x.label)}</b> ${srcLink(x.page, `PDF ${x.page}`)}</figcaption>${facsimileHTML(x.facsimiles,x.label)}<details><summary>Read the text transcription</summary><blockquote class="math">${math(x.text)}</blockquote></details></figure>`).join('');
  const editorial = n.env === 'editorial_variant' ? `<p class="note editorial">Editorial variant constructed for the atlas; the notes do not state it.</p>` : '';
  return `${printed}${editorial}<div class="paraphrase"><span class="eyebrow">${ex.length ? 'Atlas paraphrase' : 'Atlas statement'}</span><p class="math">${math(n.statement)}</p>${n.formula ? `<p class="formula math">${math(n.formula)}</p>` : ''}</div>`;
}
export function contextBlock(n) {
  const ex = n.excerpts.filter(x => x.role !== 'statement');
  if (!ex.length) return '';
  return `<details class="context"><summary>Context in the notes · ${ex.length}</summary>${ex.map(x => `<figure class="source-text"><figcaption><b>${esc(x.label)}</b> ${srcLink(x.page, `PDF ${x.page}${x.endPage > x.page ? '–' + x.endPage : ''}`)}</figcaption>${x.facsimiles?.length ? facsimileHTML(x.facsimiles, x.label) : `<blockquote class="math">${math(x.text)}</blockquote>`}</figure>`).join('')}</details>`;
}
export function occurrencesBlock(n) {
  return `<ul class="occ">${n.occurrences.map(o => `<li>${srcLink(o.page, `${o.number} · ${pages(o)}`)}<q>${esc(o.quote)}</q></li>`).join('')}</ul>`;
}
export function relationGroupsHTML(atlas, n, { why = true } = {}) {
  return atlas.groups(n.id).map(g => `<section class="rel-group kind-${g.kind}" data-kind="${g.kind}"><h4><i class="line line-${g.kind}"></i>${esc(g.title)}<span class="count">${g.items.length}</span></h4><ul>${g.items.map(({ r, other }) => `<li>${entityRow(other)}${why ? `<button class="why" data-action="why" data-rel="${r.id}" aria-label="Why">?</button>` : ''}</li>`).join('')}</ul></section>`).join('');
}
export function relationSentence(atlas, r) {
  const a = atlas.node.get(r.prereq), b = atlas.node.get(r.dependent), p = r.via ? atlas.proof.get(r.via) : null;
  return {
    proof: `Proof ${p?.label} of ${b.number} uses ${a.number}. This is a proof dependency, not logical implication.`,
    definition: `${b.number} is stated using ${a.number} (${a.en}).`, example: `${b.number} is an example of ${a.number} (${a.en}).`,
    counter: `${a.number} is a counterexample to ${b.number}.`, variant: `${b.number} is an editorial variant of ${a.number}; it is not in the notes.`,
    context: `${a.number} and ${b.number} are compared editorially. Topical similarity, not a dependency.`,
    teaching: `Suggested reading: ${a.number} before ${b.number}. Not teacher-confirmed.`, implies: `${a.number} implies ${b.number}.`
  }[r.kind];
}
export function relationCard(atlas, r) {
  const a = atlas.node.get(r.prereq), b = atlas.node.get(r.dependent);
  return `<article class="rel-card kind-${r.kind}"><div class="rel-head"><i class="line line-${r.kind}"></i><b>${esc(KIND_LABEL[r.kind])}</b><span class="review">pending teacher review</span></div><div class="rel-ends">${chip(a)}<span class="arrow">${r.directed ? '→' : '↔'}</span>${chip(b)}</div><p>${esc(relationSentence(atlas, r))}</p>${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}<details class="provenance"><summary>Provenance details</summary><p class="small">Origin: ${esc(String(r.origin).replaceAll('_', ' '))}${r.occurrences?.length ? ' · ' + r.occurrences.map(o => srcLink(o.page, `${o.number} p.${o.page}`)).join(', ') : ''}</p></details></article>`;
}

// ---- Proof ---------------------------------------------------------------------
export function proofHTML(atlas, p, { expanded = new Set(), expandAll = false, activeStep = null, activeHyp = null, removedId = null, showWires = false } = {}) {
  const n = atlas.node.get(p.theorem), label = {}; const lost = new Set(unsupportedSteps(p,removedId)), use=assumptionUse(p,activeHyp); const variant = removedId === 'gt:a:compact' ? atlas.node.get('gt:e019') : null; const counter = variant ? atlas.rels.find(r=>r.kind==='counter'&&r.dependent===variant.id) : null;
  const hyps = p.assumptions.filter(a => a.scope === 'gt:scope:global'), locals = p.assumptions.filter(a => a.scope !== 'gt:scope:global');
  hyps.forEach((a, i) => label[a.id] = `H${i + 1}`); locals.forEach((a, i) => label[a.id] = `L${i + 1}`); p.steps.forEach(s => label[s.id] = `S${s.index}`);
  const hypRow = a => `<li class="hyp${activeHyp === a.id ? ' active' : ''}" data-row="${a.id}"><span class="idx">${label[a.id]}</span><button class="hyp-text math" data-action="hyp" data-id="${a.id}">${math(a.label)}</button><span class="just">${a.scope === 'gt:scope:global' ? 'hypothesis' : 'local hypothesis'}</span></li>`;
  const stepRow = s => {
    const rule = RULES[s.inferenceRule] || { symbol: '·', label: s.inferenceRule, long: '' }, open = expandAll || expanded.has(s.id) || activeStep === s.id;
    return `<li class="step${lost.has(s.id) ? ' unsupported' : ''}${use.direct.includes(s.id) ? ' direct-use' : use.downstream.includes(s.id) ? ' downstream-use' : ''}${activeStep === s.id ? ' active' : ''}${open ? ' open' : ''}" data-row="${s.id}" id="step-${esc(s.id)}">
      <span class="idx">S${s.index}</span>
      <div class="step-main"><button class="step-title math" data-action="step" data-id="${s.id}" aria-expanded="${open}">${math(s.title)}${s.origin === 'editorial_expansion' ? '<em class="tag">atlas expansion</em>' : ''}</button>
        <div class="just"><span class="rule" title="${esc(rule.long)}"><b>${rule.symbol}</b> ${esc(rule.label)}</span>${s.inputs.map(id => `<button class="premise" data-action="premise" data-id="${id}" title="${esc(p.steps.find(y => y.id === id)?.title || p.assumptions.find(a => a.id === id)?.label || '')}">${label[id] || id}</button>`).join('')}${s.resources.length ? '<span class="by">by</span>' : ''}${s.resources.map(id => chip(atlas.node.get(id))).join('')}</div>
        ${open ? `<div class="step-body"><p class="math">${math(s.body)}</p>${s.sourceExcerpt ? `<figure class="source-text"><figcaption><span class="eyebrow">Source excerpt</span> ${srcLink(s.sourcePage || s.physicalPage, `PDF p.${s.sourcePage || s.physicalPage}`)}</figcaption>${facsimileHTML(s.facsimiles, 'Proof excerpt')}<details><summary>Read the text transcription</summary><blockquote class="math">${math(s.sourceExcerpt)}</blockquote></details></figure>` : ''}<p class="small"><details><summary>Provenance details</summary>${esc(ORIGIN[s.origin] || s.origin.replaceAll('_', ' '))}</details>${s.inputs.length ? ` · ${rule.long ? esc(rule.long) : ''}` : ''}</p></div>` : ''}
      </div></li>`;
  };
  let rows = '', scope = 'gt:scope:global', macro = 0;
  for (const s of p.steps) {
    if (s.scope !== scope && scope !== 'gt:scope:global') { rows += '</ol></li>'; scope = 'gt:scope:global'; }
    if (s.macro !== macro) { const m = p.macros.find(y => y.index === s.macro), span = p.steps.filter(y => y.macro === s.macro); rows += `<li class="macro"><span class="macro-n">${String(s.macro).padStart(2, '0')}</span><h4>${esc(m?.title || '')}</h4><small>S${span[0].index}–S${span.at(-1).index}</small></li>`; macro = s.macro; }
    if (s.scope !== scope) { const sc = p.scopes.find(y => y.id === s.scope); rows += `<li class="scope"><div class="scope-head"><b>${sc?.quantifier ? '∀' : 'let'}</b> <span class="math">${math(sc?.variables?.[0] || '')}</span></div><ol class="steps">`; scope = s.scope; }
    rows += stepRow(s);
    for (const a of locals) if (p.scopes.find(y => y.id === a.scope)?.introducedAt === s.id) rows += hypRow(a);
  }
  if (scope !== 'gt:scope:global') rows += '</ol></li>';
  const tools = atlas.proofFocus(n.id).length - 1;
  return `<article class="proof${p.steps.length === 1 ? ' slim' : ''}" data-proof="${p.id}">
    <header class="proof-head"><span class="eyebrow">${esc(n.number)} · ${esc(p.label)} · ${esc(p.title)}</span><h2>${esc(n.en)}</h2>
      <p class="meta"><span>${p.steps.length} step${p.steps.length > 1 ? 's' : ''}</span><span>${tools} result${tools === 1 ? '' : 's'} and definition${tools === 1 ? '' : 's'} cited</span>${p.sourcePage ? srcLink(p.sourcePage, `Source p.${p.sourcePage}`) : ''}<span class="review">pending teacher review</span></p></header>
    ${statementBlock(atlas, n)}
    ${p.premisePolicy ? `<p class="policy">${esc(p.premisePolicy)}</p>` : ''}
    <div class="derivation"${showWires ? ' data-wires="1"' : ''}>
      <ol class="hyps"><li class="macro"><span class="macro-n">H</span><h4>Hypotheses</h4><small>${hyps.length ? 'all ' + hyps.length + ' required' : 'none recorded separately'}</small></li>${hyps.map(hypRow).join('')}</ol>
      <ol class="steps">${rows}</ol>
    </div>
    <div class="proof-actions"><button class="btn" data-action="expand-all" aria-pressed="${expandAll}">${expandAll ? 'Collapse step explanations' : `Explain ${p.steps.length === 1 ? 'this step' : 'all ' + p.steps.length + ' steps'}`}</button></div>
    ${hyps.length ? `<details class="assumption-lab"${removedId ? ' open' : ''}><summary>What if a hypothesis is removed?</summary><p>Losing a justification is not a proof that the conclusion is false.</p>${hyps.map(a=>`<button class="btn" data-action="remove-assumption" data-id="${a.id}" aria-pressed="${removedId===a.id}">${removedId===a.id?'Restore':'Remove'} ${esc(a.label)}</button>`).join(' ')}${removedId?`<p class="note">Steps losing recorded support: ${p.steps.filter(s=>lost.has(s.id)).map(s=>'S'+s.index).join(', ')||'none'}.</p>${variant?`<p>Recorded editorial variant: ${chip(variant)} ${esc(variant.statement)}</p>${counter?`<p>Recorded counterexample: ${chip(atlas.node.get(counter.prereq))}</p>`:''}`:'<p>No variant or counterexample is recorded for this removal.</p>'}`:''}</details>`:''}
    <details class="original"><summary>Read the original proof${p.sourcePage ? ' · p.' + p.sourcePage : ''}</summary>${facsimileHTML(p.facsimiles, 'Original proof')}<details><summary>Read the text transcription</summary><blockquote class="math pre">${math(p.sourceText)}</blockquote></details>${p.sourcePage ? srcLink(p.sourcePage, `Open PDF p.${p.sourcePage}`) : ''}<p class="small">Step labels, scopes and premise numbers are an atlas reconstruction, pending teacher review.</p></details>
  </article>`;
}

// Draw premise wires in an SVG overlay inside .derivation (static; redrawn on change only).
export function drawWires(container, p, activeStep) {
  const d = container.querySelector('.derivation'); if (!d) return;
  let svg = d.querySelector('svg.wires'); if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'wires'); svg.setAttribute('aria-hidden', 'true'); d.prepend(svg); }
  const box = d.getBoundingClientRect(), y = id => { const r = d.querySelector(`[data-row="${CSS.escape(id)}"]`)?.getBoundingClientRect(); return r ? r.top - box.top + Math.min(r.height / 2, 16) : null; };
  let out = ''; const gx = 18;
  for (const s of p.steps) { const y2 = y(s.id); if (y2 == null || !s.inputs.length) continue; const hot = activeStep === s.id;
    for (const id of s.inputs) { const y1 = y(id); if (y1 == null) continue; const w = Math.min(18, 5 + Math.abs(y2 - y1) * .05); out += `<path class="wire${hot ? ' hot' : ''}" d="M${gx},${y1.toFixed(1)} C${gx - w},${y1.toFixed(1)} ${gx - w},${y2.toFixed(1)} ${gx},${y2.toFixed(1)}"/>`; }
    out += `<circle class="wire-dot${hot ? ' hot' : ''}" cx="${gx}" cy="${y2.toFixed(1)}" r="2.4"/>`; }
  svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`); svg.style.height = box.height + 'px'; svg.style.width = box.width + 'px'; svg.innerHTML = out;
}
