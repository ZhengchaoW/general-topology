// Shared UI helpers: search, entity card composition, "why" relation cards, proof state.
import { esc, math, numberLabel, ROLE_LABEL, KIND_LABEL } from './core.js';
import { statementBlock, contextBlock, occurrencesBlock, relationGroupsHTML, relationCard, proofHTML, drawWires, pages, srcLink, mark, chip } from './blocks.js';

export function bindSearch(input, results, atlas, onPick) {
  let items = [], active = -1;
  const render = () => { results.innerHTML = items.slice(0, 12).map((n, i) => `<button role="option" class="result${i === active ? ' active' : ''}" data-id="${n.id}">${mark(n.role)}<span><b>${esc(n.en)}</b><small>${esc(n.number)} · Chapter ${atlas.chapter.get(n.chapter).number} · p.${n.page}</small></span></button>`).join('') || '<p class="small" style="padding:8px 10px">No match. Try a number such as 6.20, or a word from the statement.</p>'; results.hidden = false; };
  input.addEventListener('input', () => { const q = input.value.trim(); if (!q) { results.hidden = true; return; } items = atlas.search(q); active = -1; render(); });
  input.addEventListener('keydown', e => { if (results.hidden) return; if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); } else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); } else if (e.key === 'Enter' && items[active >= 0 ? active : 0]) { onPick(items[active >= 0 ? active : 0].id); results.hidden = true; input.blur(); } else if (e.key === 'Escape') { results.hidden = true; input.blur(); } });
  results.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) { onPick(b.dataset.id); results.hidden = true; input.value = ''; } });
  document.addEventListener('click', e => { if (!results.contains(e.target) && e.target !== input) results.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== input && !e.target.closest('input,textarea')) { e.preventDefault(); input.focus(); } });
}

// Entity card: header, statement in the notes, proof entry, grouped relations, source locations.
export function entityCardHTML(atlas, n, { headerExtra = '', proofButton = true } = {}) {
  const ch = atlas.chapter.get(n.chapter), proofs = atlas.proofsOf.get(n.id) || [];
  const tools = atlas.proofFocus(n.id).length - 1;
  return `<div class="card-head"><span class="eyebrow role-${n.role}">${ROLE_LABEL[n.role]} · ${esc(n.number)}</span>${headerExtra}<h2 class="title">${esc(n.en)}</h2>
    <p class="meta"><span class="chapter-pill ch-${n.chapter}">Ch. ${ch.number} · ${esc(ch.title)}</span><span>${esc(atlas.sectionOf(n))}</span><span>Frozen PDF p.${n.page}</span></p></div>
    ${statementBlock(atlas, n)}${contextBlock(n)}
    ${n.fullEnvironmentId ? `<p class="note">Models selected parts of ${chip(atlas.node.get(n.fullEnvironmentId))} (complete printed environment).</p>` : ''}
    ${proofButton && proofs.length ? proofs.map((p, i) => `<button class="btn primary proof-open" data-action="proof" data-id="${p.id}"><span><b>Read proof ${esc(p.label)}${proofs.length > 1 ? ' · ' + esc(p.title) : ''}</b><small>${p.steps.length} step${p.steps.length > 1 ? 's' : ''} · ${i ? '' : tools + ' cited entit' + (tools === 1 ? 'y' : 'ies') + ' · '}frozen PDF p.${p.sourcePage}</small></span><span class="go">→</span></button>`).join('') : ''}
    ${!proofs.length && ['result', 'example'].includes(n.role) ? `<p class="note">${esc(n.sourceProofDisposition?.note || 'No separately written proof is supplied for this environment in the notes.')} ${n.sourceProofDisposition ? srcLink(n.sourceProofDisposition.physicalPage, 'Source instruction') : ''}</p>` : ''}
    <div class="relations">${relationGroupsHTML(atlas, n)}</div>
    <h4 class="section-label">Topics</h4><p class="topics">${n.topics.map(t => `<button class="topic" data-topic="${t}">${esc(atlas.topics.get(t))}</button>`).join('')}</p>
    <h4 class="section-label">Source locations</h4>${occurrencesBlock(n)}
    <details class="provenance"><summary>Provenance details</summary><p class="small">Review: ${esc(n.review.replaceAll('_', ' '))} · origin ${esc(n.origin.replaceAll('_', ' '))}. ${n.env !== 'editorial_variant' && ({ theorem: 'result', lemma: 'result', proposition: 'result', corollary: 'result', remark: 'result', unnumbered_definition: 'definition', unnumbered_result: 'result', problem: 'example' }[n.env] || n.env) !== n.role ? `Printed as ${esc(n.env)} in the notes; recorded as a ${n.role}.` : ''}</p></details><p class="review">pending teacher review</p>${atlas.review.items.filter(x=>x.relatesTo.includes(n.id)).map(x=>`<aside class="note"><b>${esc(x.title)}</b> ${esc(x.body)} ${srcLink(x.page)}</aside>`).join('')}`;
}

export function whyHTML(atlas, relId) { const r = atlas.rels.find(x => x.id === relId); return r ? relationCard(atlas, r) : ''; }

// Proof reading state shared by the prototypes.
export class ProofReader {
  constructor(atlas, container, { onResourceHover, onResourceSelect, onStep, wires = true } = {}) {
    Object.assign(this, { atlas, container, onResourceHover, onResourceSelect, onStep, wires });
    this.state = { proofId: null, expanded: new Set(), expandAll: false, activeStep: null, activeHyp: null, removedId: null };
    container.addEventListener('click', e => {
      const b = e.target.closest('[data-action]'); if (!b) return;
      if (b.closest('.proof-slot') !== this.container) return;
      const { action, id } = b.dataset;
      if (action === 'step') { this.state.activeStep = this.state.activeStep === id ? null : id; this.render(); this.onStep?.(this.activeStep()); }
      else if (action === 'hyp') { this.state.activeHyp = this.state.activeHyp === id ? null : id; this.render(); }
      else if (action === 'remove-assumption') { this.state.removedId = this.state.removedId === id ? null : id; this.render(); }
      else if (action === 'premise') { this.state.activeStep = id; this.render(); this.scrollTo(id); }
      else if (action === 'expand-all') { this.state.expandAll = !this.state.expandAll; this.render(); this.onStep?.(this.activeStep()); }
      else if (action === 'select') { this.onResourceSelect?.(id); }
    });
    container.addEventListener('pointerover', e => { const c = e.target.closest('[data-hover]'); if (c) this.onResourceHover?.(c.dataset.hover); });
    container.addEventListener('pointerout', e => { const c = e.target.closest('[data-hover]'); if (c && !e.relatedTarget?.closest?.('[data-hover]')) this.onResourceHover?.(null); });
  }
  open(proofId) { this.state = { proofId, expanded: new Set(), expandAll: false, activeStep: null, activeHyp: null, removedId: null }; this.render(); }
  close() { this.state.proofId = null; this.container.innerHTML = ''; }
  get proof() { return this.state.proofId ? this.atlas.proof.get(this.state.proofId) : null; }
  activeStep() { return this.proof?.steps.find(s => s.id === this.state.activeStep) || null; }
  resourcesInView() { const p = this.proof; if (!p) return []; const s = this.activeStep(); return s ? s.resources : [...new Set(p.steps.flatMap(x => x.resources))]; }
  render() {
    const p = this.proof; if (!p) return;
    const scroller = this.container.closest('.scroll') || this.container; const top = scroller.scrollTop;
    this.container.innerHTML = proofHTML(this.atlas, p, this.state);
    scroller.scrollTop = top;
    if (this.wires) requestAnimationFrame(() => drawWires(this.container, p, this.state.activeStep));
  }
  scrollTo(id) { this.container.querySelector(`[data-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

export const fmtCount = (n, s, p) => `${n} ${n === 1 ? s : p}`;
