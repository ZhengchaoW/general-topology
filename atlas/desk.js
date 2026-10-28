// Reading desk (from direction D): an entity opens as a page; its proof opens in place;
// a cited result opens beneath the step that cites it, as deep as the reader goes.
// The graph of the host prototype only reacts through `onState`.
import { esc, numberLabel, ROLE_LABEL } from './core.js';
import { entityCardHTML, whyHTML, ProofReader } from './ui.js';
import { statementBlock, srcLink, chip } from './blocks.js';

export function createDesk(atlas, { deskEl, trailEl, whyEl, whyBodyEl, introHTML, onState, onHover, onChapter }) {
  const state = { selected: null, path: [], hot: new Set(), proofOpen: false };
  const readers = new Map();
  const emit = () => onState?.(state);
  function renderTrail() {
    trailEl.innerHTML = state.path.map((id, i) => `<button data-action="trail" data-i="${i}" ${i === state.path.length - 1 ? 'aria-current="true"' : ''}>${esc(numberLabel(atlas.node.get(id)))}</button>`).join('<span class="sep">›</span>') + (state.path.length > 1 ? `<span class="small">reading trail · ${state.path.length - 1} level${state.path.length > 2 ? 's' : ''} deep</span>` : '');
  }
  function renderDesk() {
    readers.clear(); renderTrail();
    const n = state.selected && atlas.node.get(state.selected);
    deskEl.innerHTML = n ? `<article class="leaf level-0" data-id="${n.id}">${entityCardHTML(atlas, n)}</article>` : introHTML();
  }
  function select(id) { if (!atlas.node.has(id)) return; state.selected = id; state.path = [id]; state.hot = new Set(); state.proofOpen = false; try { history.replaceState(null, '', '#' + id); } catch {} renderDesk(); emit(); }
  function clear() { history.replaceState(null, '', location.pathname); state.selected = null; state.path = []; state.hot = new Set(); state.proofOpen = false; renderDesk(); emit(); }
  function openNested(host, id, level) {
    const n = atlas.node.get(id); if (!n || host.querySelector(`:scope > .leaf[data-id="${CSS.escape(id)}"]`)) return;
    const proofs = atlas.proofsOf.get(id) || [];
    const leaf = document.createElement('article'); leaf.className = `leaf level-${level}`; leaf.dataset.id = id;
    leaf.innerHTML = `<div class="leaf-head"><span class="eyebrow">${ROLE_LABEL[n.role]} · ${esc(n.number)} · Chapter ${atlas.chapter.get(n.chapter).number} · p.${n.page}</span><button class="icon" data-action="close-leaf" aria-label="Close">×</button></div><h3>${esc(n.en)}</h3>${statementBlock(atlas, n)}
      <div class="leaf-actions">${proofs.map(p => `<button class="btn" data-action="proof" data-id="${p.id}">Read its proof ${esc(p.label)} here · ${p.steps.length} step${p.steps.length > 1 ? 's' : ''}</button>`).join('')}<button class="btn ghost" data-action="select" data-id="${id}">Make this the page</button>${srcLink(n.page, 'PDF p.' + n.page)}</div>
      ${n.role !== 'definition' && !proofs.length ? '<p class="note">No separately written proof in the notes for this environment.</p>' : ''}<div class="proof-slot"></div>`;
    host.append(leaf); state.path = [...state.path.slice(0, level), id]; renderTrail(); emit();
    leaf.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function openProofIn(container, pid) {
    const slot = container.querySelector(':scope > .proof-slot') || container; if (slot.dataset.proof === pid) return; slot.dataset.proof = pid; slot.innerHTML = '';
    const level = +(container.className.match(/level-(\d+)/)?.[1] || 0);
    const reader = new ProofReader(atlas, slot, { wires: level === 0, onResourceHover: id => onHover?.(id), onResourceSelect: id => { const step = slot.querySelector(`.step [data-id="${CSS.escape(id)}"]`)?.closest('.step'); const host = step ? (step.querySelector(':scope > .nest') || Object.assign(step.appendChild(document.createElement('div')), { className: 'nest' })) : slot; openNested(host, id, level + 1); }, onStep: () => { state.hot = new Set(reader.resourcesInView()); emit(); } });
    readers.set(pid, reader); reader.open(pid); if (level === 0) state.proofOpen = true; state.hot = new Set(reader.resourcesInView()); emit();
  }
  deskEl.addEventListener('click', e => {
    const b = e.target.closest('[data-action]'); if (!b) return; const { action, id, rel } = b.dataset; const leaf = b.closest('.leaf');
    if (action === 'proof') { if (leaf?.classList.contains('level-0') && !b.closest('.proof-slot')) { let slot = leaf.querySelector(':scope > .proof-slot'); if (!slot) { slot = document.createElement('div'); slot.className = 'proof-slot'; const btn = b.closest('.proof-open'); if (btn) btn.after(slot); else leaf.append(slot); } openProofIn(leaf, id); } else if (leaf) openProofIn(leaf, id); }
    else if (action === 'select' && !b.closest('.proof-slot')) select(id);
    else if (action === 'why') { whyBodyEl.innerHTML = whyHTML(atlas, rel); whyEl.hidden = false; }
    else if (action === 'close-leaf') { const lv = +(leaf.className.match(/level-(\d+)/)?.[1] || 0); leaf.remove(); state.path = state.path.slice(0, lv); renderTrail(); state.hot = new Set(); emit(); }
    else if (action === 'chapter') onChapter?.(id);
  });
  trailEl.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const i = +b.dataset.i, id = state.path[i]; (i === 0 ? deskEl.querySelector('.leaf.level-0') : deskEl.querySelector(`.leaf[data-id="${CSS.escape(id)}"]`))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  deskEl.addEventListener('pointerover', e => { const c = e.target.closest('[data-hover]'); if (c) onHover?.(c.dataset.hover); });
  deskEl.addEventListener('pointerout', e => { const c = e.target.closest('[data-hover]'); if (c) onHover?.(null); });
  whyEl.addEventListener('click', e => { if (e.target.closest('[data-action="close-why"]') || e.target === whyEl) whyEl.hidden = true; const b = e.target.closest('[data-action="select"]'); if (b) { whyEl.hidden = true; select(b.dataset.id); } });
  function openProof(pid) { const p = atlas.proof.get(pid); if (!p) return; select(p.theorem); openProofIn(deskEl.querySelector('.leaf.level-0'), pid); }
  const api = { state, select, clear, openProof, renderDesk,
    openNestedById: id => { const leaf = deskEl.querySelector('.leaf.level-0'); const step = leaf?.querySelector(`.step [data-id="${CSS.escape(id)}"]`)?.closest('.step'); if (!step) return; const host = step.querySelector(':scope > .nest') || Object.assign(step.appendChild(document.createElement('div')), { className: 'nest' }); openNested(host, id, 1); },
    expandAll: () => { for (const r of readers.values()) { r.state.expandAll = true; r.render(); } } };
  return api;
}
export const startChips = atlas => ['gt:e018', 'gt:n:theorem:6.34', 'gt:n:theorem:3.64', 'gt:n:theorem:1.44', 'gt:n:theorem:7.18'].map(id => chip(atlas.node.get(id))).join(' ');
