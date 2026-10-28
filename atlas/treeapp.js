// Scaffold for the tree family: loads the atlas, builds whole-course / cone trees,
// wires the reading desk, camera, search and key. A variant supplies `layout` and `paint`.
import { loadAtlas, numberLabel, esc, ROLE_LABEL, KIND_LABEL, CHAPTER_HUE } from './core.js';
import { CanvasView, Grid, placeLabels } from './canvas.js';
import { bindSearch } from './ui.js';
import { mark } from './blocks.js';
import { createDesk, startChips } from './desk.js';
import { prereqIndex, courseTree, coneTree } from './tree.js';

export { numberLabel, esc, ROLE_LABEL, KIND_LABEL, CHAPTER_HUE, placeLabels, mark };
export const chapterColor = (id, l = 48, s = 58) => `hsl(${CHAPTER_HUE[id]} ${s}% ${l}%)`;
export const KCOL = { proof: [170, 120, 30], definition: [70, 110, 180], implies: [120, 80, 190], example: [40, 140, 95], counter: [200, 60, 90], variant: [200, 60, 90], context: [120, 120, 120], teaching: [120, 120, 120] };
export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export async function bootTreeApp({ name, intro, keyHTML, layout, paint, hitRadius = 12, fitPad = 110, maxZoomFit = 3, onKey, rebuildOnSelect = true, bind = true, onSelect = null, zoomHandler = null, chapterHandler = null, fitHandler = null, extraIntro = null }) {
  const $ = s => document.querySelector(s);
  const atlas = await loadAtlas('data/atlas.json');
  const PRE = prereqIndex(atlas);
  const mobile = () => innerWidth <= 720;
  const app = { atlas, tree: null, lay: null, grid: null, showLinks: true, view: null, desk: null, hover: null };
  function rebuild(id) { app.tree = id ? coneTree(atlas, PRE, id) : courseTree(atlas, PRE); app.lay = layout(app.tree, app); app.grid = new Grid([...app.lay.pos].map(([i, p]) => ({ id: i, x: p.x, y: p.y })), 70); }
  rebuild(null);
  const view = new CanvasView($('#graph'), { paint: (ctx, cam, vp) => paint(ctx, cam, vp, app), hit: (x, y) => { if (app.lay.hit) return app.lay.hit(view.toWorld(x, y), view.cam.z); const w = view.toWorld(x, y); return app.grid.nearest(w.x, w.y, hitRadius / view.cam.z + 6)?.id || null; }, onClick: id => { if (id) desk.select(id); }, onHover: hover, onIdle: () => { $('#zoomv').textContent = Math.round(view.cam.z * 100) + '%'; }, minZoom: .06, maxZoom: 4, bind });
  app.view = view;
  function fitAll(animate) { const b = app.lay.bounds || (() => { const ps = [...app.lay.pos.values()]; return { minX: Math.min(...ps.map(p => p.x)) - fitPad, maxX: Math.max(...ps.map(p => p.x)) + fitPad, minY: Math.min(...ps.map(p => p.y)) - fitPad, maxY: Math.max(...ps.map(p => p.y)) + fitPad }; })(); view.fit(b, 6, maxZoomFit, animate); }
  function hover(id) { app.hover = id; const tip = $('#tip'); if (!id || !app.lay.pos.has(id)) { tip.hidden = true; view.canvas.style.cursor = 'grab'; if (app.lay.hoverRepaint) view.requestSettled(); return; } const n = atlas.node.get(id), p = app.lay.screen ? app.lay.screen(id, view) : view.toScreen(app.lay.pos.get(id)); view.canvas.style.cursor = 'pointer'; const via = app.tree.via.get(id); tip.innerHTML = `${mark(n.role)}<b>${esc(numberLabel(n))}</b> ${esc(n.en)}<small>${ROLE_LABEL[n.role]} · Chapter ${atlas.chapter.get(n.chapter).number} · p.${n.page}${via ? ` · hangs from ${esc(numberLabel(atlas.node.get(app.tree.parent.get(id))))} (${esc(KIND_LABEL[via.kind]).toLowerCase()})` : ''}</small>`; tip.hidden = false; const w = view.canvas.parentElement.getBoundingClientRect(); tip.style.left = Math.max(4, Math.min(w.width - 290, p.x + 12)) + 'px'; tip.style.top = Math.max(4, Math.min(w.height - 60, p.y - 14)) + 'px'; if (app.lay.hoverRepaint) view.requestSettled(); }
  $('.zoom').addEventListener('click', e => { const b = e.target.closest('[data-z]'); if (!b) return; if (zoomHandler) return zoomHandler(b.dataset.z, app); if (b.dataset.z === 'fit') fitAll(true); else view.zoomAt(b.dataset.z === 'in' ? 1.4 : 1 / 1.4, view.width / 2, view.height / 2); });
  $('#key').innerHTML = keyHTML(atlas);
  $('#key').addEventListener('click', e => { const t = e.target.closest('[data-toggle]'); if (t) { app.showLinks = !app.showLinks; t.setAttribute('aria-pressed', app.showLinks); view.requestSettled(); } onKey?.(e, app); });
  let lastKey = '';
  const desk = createDesk(atlas, { deskEl: $('#desk-scroll'), trailEl: $('#trail'), whyEl: $('#why'), whyBodyEl: $('#why-body'),
    introHTML: () => intro(atlas, app) + `<h4 class="section-label">Chapters</h4><ol class="chapters">${atlas.chapters.map(ch => `<li><button data-action="chapter" data-id="${ch.id}"><i style="background:${chapterColor(ch.id, 50)}"></i><b>${ch.number}</b><span>${esc(ch.title)}<small>pp. ${ch.start}–${ch.end} · ${ch.nodes.length} entities</small></span></button></li>`).join('')}</ol><h4 class="section-label">Start somewhere</h4><p class="starts">${startChips(atlas)}</p>${extraIntro ? extraIntro(atlas, app) : ''}<p class="small">Which of several prerequisites is drawn as the trunk is a drawing choice (the one with the longest chain beneath it); the relation itself is always a recorded one, and every other relation stays as a faint cross-link. ${atlas.counts.entities} entities, ${atlas.counts.canonical} canonical records, ${atlas.counts.proofs} proofs; v4 data unchanged, pending teacher review.</p>`,
    onState: s => { const key = `${s.selected}`; if (key !== lastKey) { lastKey = key; if (rebuildOnSelect) { rebuild(s.selected); requestAnimationFrame(() => { view.resize(); fitAll(true); }); } sheet(s.selected ? 'half' : 'peek'); onSelect?.(s.selected, app); } view.requestSettled(); },
    onHover: id => (app.hoverFn || hover)(id), onChapter: id => { if (chapterHandler) return chapterHandler(id, app); const pts = atlas.chapter.get(id).nodes.map(n => app.lay.pos.get(n.id)).filter(Boolean); if (!pts.length) return; view.fit({ minX: Math.min(...pts.map(p => p.x)) - 120, maxX: Math.max(...pts.map(p => p.x)) + 120, minY: Math.min(...pts.map(p => p.y)) - 120, maxY: Math.max(...pts.map(p => p.y)) + 120 }, 20, 1.6, true); } });
  app.desk = desk;
  bindSearch($('#search'), $('#results'), atlas, id => desk.select(id));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#why').hidden) $('#why').hidden = true; else if (desk.state.selected) desk.clear(); } if (e.key === '0' && !e.target.closest('input')) { if (fitHandler) fitHandler(app); else fitAll(true); } });
  function sheet(mode) { if (!mobile()) { view.insets = { top: 0, bottom: 0, left: 0, right: 0 }; return; } $('#desk').dataset.sheet = mode; view.insets = { top: 0, bottom: { peek: 96, half: innerHeight * .5, full: innerHeight * .92 }[mode], left: 0, right: 0 }; }
  $('.sheet-handle').addEventListener('click', () => { const p = $('#desk'); p.dataset.sheet = ({peek:'half',half:'full',full:'peek'})[p.dataset.sheet || 'peek']; });
  desk.renderDesk(); sheet('peek'); fitAll(false);
  const hash = decodeURIComponent(location.hash.slice(1)); if (atlas.node.has(hash)) desk.select(hash);
  window.addEventListener('hashchange', () => { const id=decodeURIComponent(location.hash.slice(1)); if(atlas.node.has(id)) desk.select(id); else if(!id) desk.clear(); });
  window.proto = { atlas, view, state: desk.state, app, select: desk.select, clear: desk.clear, openProof: id => desk.openProof(atlas.proof.has(id) ? id : atlas.proofsOf.get(id)[0].id), closeProof: () => desk.state.selected && desk.select(desk.state.selected), openNested: desk.openNestedById, expandAllSteps: desk.expandAll, fit: fitAll, ready: true };
  app.hoverFn = hover;
  return app;
}
// Focus sets shared by the painters.
export function focusOf(app) { const ds = app.desk?.state || { selected: null, path: [], hot: new Set(), proofOpen: false }; const theorem = ds.proofOpen ? (ds.path.at(-1) || ds.selected) : null; return { ds, sel: ds.selected, hot: ds.hot, pathSet: new Set(ds.path), theorem, focusIds: theorem ? new Set([theorem, ...ds.hot]) : null }; }
// Faint cross-links (every recorded relation that is not a trunk of the current tree).
export function drawCrossLinks(ctx, S, app, f, { curveToward = null, baseAlpha = { proof: .12, other: .05 } } = {}) {
  if (!app.showLinks) return; const { tree, lay, atlas } = app; ctx.lineCap = 'round';
  for (const r of atlas.rels) { if (r.kind === 'teaching' || !lay.pos.has(r.prereq) || !lay.pos.has(r.dependent)) continue; if (tree.via.get(r.dependent)?.id === r.id || tree.via.get(r.prereq)?.id === r.id) continue;
    const a = S(lay.pos.get(r.prereq)), b = S(lay.pos.get(r.dependent)); const hotLink = f.focusIds && r.kind === 'proof' && r.dependent === f.theorem;
    ctx.strokeStyle = rgba(KCOL[r.kind], hotLink ? (f.hot.size && !f.hot.has(r.prereq) ? .35 : .9) : f.focusIds ? .02 : r.kind === 'proof' ? baseAlpha.proof : baseAlpha.other); ctx.lineWidth = hotLink ? 2 : .7; ctx.setLineDash(r.kind === 'example' ? [2, 4] : r.kind === 'counter' || r.kind === 'variant' ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); if (curveToward) { const c = S(curveToward), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; ctx.quadraticCurveTo(mx + (c.x - mx) * .35, my + (c.y - my) * .35, b.x, b.y); } else ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.setLineDash([]);
}
export const keyChapters = (atlas, extra = '') => `<span class="k">${atlas.chapters.map(c => `<i class="ink" style="background:${chapterColor(c.id, 48)}"></i>${c.number}`).join(' ')}</span>${extra}<button class="k" data-toggle="links" aria-pressed="true"><i class="line line-context"></i>all other recorded relations</button><span class="k">${mark('definition')}${mark('result')}${mark('example')} role</span>`;
