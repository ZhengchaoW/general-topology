// Hyperbolic atlas engine (round 4). The whole-course dependency tree embedded in the
// Poincaré disk, drawn in the style of D (charcoal ground, relations coloured by meaning,
// a chapter band on the rim, radial labels).
//
//   view transform   z  ->  mag( T_c(z), k )
//     T_c(z) = (z - c)/(1 - conj(c) z)      Möbius isometry: click / drag re-centres
//     mag(w, k): |w| -> tanh(k * artanh|w|)  hyperbolic zoom: k hyperbolic units become 1
//
// Modes:  'ribbons'   every relation bundled along the tree (Holten bundling) — D's look
//         'branches'  tree drawn as geodesic branches in chapter colour, ribbons beneath
//         'geodesics' every relation as its own hyperbolic geodesic, over a hyperbolic grid
import { bootTreeApp, numberLabel, esc, focusOf, KIND_LABEL, ROLE_LABEL, CHAPTER_HUE, mark } from './treeapp.js';

// ---- complex arithmetic ---------------------------------------------------------------------------
const C = (re, im) => ({ re, im });
const csub = (a, b) => C(a.re - b.re, a.im - b.im), cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re), conj = a => C(a.re, -a.im), abs2 = a => a.re * a.re + a.im * a.im;
const cdiv = (a, b) => { const d = abs2(b) || 1e-12, n = cmul(a, conj(b)); return C(n.re / d, n.im / d); };
export const mob = (z, c) => cdiv(csub(z, c), csub(C(1, 0), cmul(conj(c), z)));
export const mobInv = (w, c) => cdiv(cadd(w, c), cadd(C(1, 0), cmul(conj(c), w)));
const atanh = x => .5 * Math.log((1 + x) / (1 - x));
export function mag(w, k) { const m = Math.sqrt(abs2(w)); if (m < 1e-9) return w; const m2 = Math.tanh(k * atanh(Math.min(m, .9999999))); return C(w.re * m2 / m, w.im * m2 / m); }
export function unmag(u, k) { const m = Math.sqrt(abs2(u)); if (m < 1e-9) return u; const m2 = Math.tanh(atanh(Math.min(m, .9999999)) / k); return C(u.re * m2 / m, u.im * m2 / m); }

export function geoPts(za, zb, n) { const bp = mob(zb, za), L = Math.sqrt(abs2(bp)) || 1e-9, ah = atanh(Math.min(.9999999, L)); const out = []; for (let i = 0; i <= n; i++) { const s = Math.tanh(ah * i / n) / L; out.push(mobInv(C(bp.re * s, bp.im * s), za)); } return out; }

// ---- palette (D) -------------------------------------------------------------------------------------
const KC = { proof: [231, 180, 90], definition: [127, 166, 230], implies: [176, 136, 244], example: [92, 196, 154], counter: [232, 100, 126], variant: [232, 100, 126], context: [150, 152, 160], teaching: [150, 152, 160] };
const ROLECOL = { definition: '#86aceb', result: '#ebbb63', example: '#62c9a0', variant: '#e4607a' };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const chap = (id, l = 62, s = 62) => `hsl(${CHAPTER_HUE[id]} ${s}% ${l}%)`;
const ROLES = ['definition', 'result', 'example', 'variant'];
const KINDS = ['proof', 'definition', 'implies', 'example', 'counter', 'context'];

export async function bootHyper({ mode, intro, title }) {
  const S = { centre: C(0, 0), k: 1, roles: new Set(ROLES), kinds: new Set(KINDS), topics: new Set(), isolate: false, history: [], future: [], moving: true, anim: 0, idle: 0 };
  let app;
  const STEP = .64;
  // ---- layout: radial tidy angles, one hyperbolic step per level; virtual root at the origin ----------
  function layout(tree, A) {
    const pos = new Map(), lvl = new Map();
    const place = (id, a0, a1, lv) => { const mid = (a0 + a1) / 2, re = Math.tanh(lv * STEP / 2); pos.set(id, C(Math.cos(mid) * re, Math.sin(mid) * re)); lvl.set(id, lv); let a = a0; for (const kk of tree.children.get(id)) { const span = (a1 - a0) * tree.leaves.get(kk) / tree.leaves.get(id); place(kk, a, a + span, lv + 1); a += span; } };
    let a = -Math.PI / 2; for (const r of tree.roots) { const span = 2 * Math.PI * tree.leaves.get(r) / tree.totalLeaves; place(r, a, a + span, 1); a += span; }
    // ancestors (with the virtual root '' at the origin) for bundling
    const anc = new Map(); for (const id of pos.keys()) { const chain = [id]; let cur = id; while (tree.parent.has(cur)) { cur = tree.parent.get(cur); chain.push(cur); } chain.push(''); anc.set(id, chain); }
    // importance: how often it is used (recorded relations + citations in proofs), on a log scale
    const atlas = A.atlas, use = new Map(atlas.nodes.map(n => [n.id, 0]));
    for (const r of atlas.rels) { use.set(r.prereq, use.get(r.prereq) + (r.kind === 'proof' ? 2 : 1)); use.set(r.dependent, use.get(r.dependent) + .25); }
    const umax = Math.max(...use.values()); const imp = new Map([...use].map(([id, u]) => [id, Math.log1p(u) / Math.log1p(umax)]));
    return { pos, lvl, maxLevel: Math.max(...lvl.values()), anc, imp, hoverRepaint: false, bounds: { minX: -1.1, maxX: 1.1, minY: -1.1, maxY: 1.1 }, screen: (id, view) => toScreen(pos.get(id), { width: view.width, height: view.height }) };
  }
  const disk = vp => { const R = Math.max(1, Math.min(vp.width, vp.height) / 2 - 46); return { R, cx: vp.width / 2, cy: vp.height / 2 - 4 }; };
  const view2 = z => screenTransform(z, S.centre, S.k);
  function toScreen(z, vp) { const { R, cx, cy } = disk(vp); const d = view2(z); return { x: cx + d.re * R, y: cy + d.im * R, d }; }
  // bundle path between two nodes through their lowest common ancestor in the tree
  function treePath(lay, a, b) { const A = lay.anc.get(a), B = lay.anc.get(b); const setB = new Map(B.map((x, i) => [x, i])); let i = 0; while (i < A.length && !setB.has(A[i])) i++; const j = setB.get(A[i]); return [...A.slice(0, i + 1), ...B.slice(0, j).reverse()]; }
  const pathCache = new Map(), geodesicCache = new Map();
  function bspline(ctx, P, beta, samples) { const N = P.length; if (N === 2) { ctx.moveTo(P[0].x, P[0].y); ctx.lineTo(P[1].x, P[1].y); return; } const P0 = P[0], PN = P[N - 1]; const Q = P.map((p, i) => ({ x: beta * p.x + (1 - beta) * (P0.x + i / (N - 1) * (PN.x - P0.x)), y: beta * p.y + (1 - beta) * (P0.y + i / (N - 1) * (PN.y - P0.y)) })); const K = [Q[0], Q[0], ...Q, Q[N - 1], Q[N - 1]]; ctx.moveTo(Q[0].x, Q[0].y); for (let s = 0; s + 3 < K.length; s++) for (let t = 1; t <= samples; t++) { const u = t / samples, u2 = u * u, u3 = u2 * u, b0 = (1 - u) ** 3 / 6, b1 = (3 * u3 - 6 * u2 + 4) / 6, b2 = (-3 * u3 + 3 * u2 + 3 * u + 1) / 6, b3 = u3 / 6; ctx.lineTo(b0 * K[s].x + b1 * K[s + 1].x + b2 * K[s + 2].x + b3 * K[s + 3].x, b0 * K[s].y + b1 * K[s + 1].y + b2 * K[s + 2].y + b3 * K[s + 3].y); } }
  // geodesic between world points, sampled (move a to 0, straight ray, move back)

  const dash = k => k === 'example' ? [2, 4] : k === 'counter' || k === 'variant' ? [6, 4] : k === 'context' || k === 'teaching' ? [1, 5] : [];

  function paint(ctx, cam, vp, A) {
    const { tree, lay, atlas } = A, f = focusOf(A), { R, cx, cy } = disk(vp);
    const moving = S.moving;
    ctx.fillStyle = '#16171a'; ctx.fillRect(0, 0, vp.width, vp.height);
    // disk ground: a faint radial vignette
    const g = ctx.createRadialGradient(cx, cy, R * .1, cx, cy, R); g.addColorStop(0, '#1d1f24'); g.addColorStop(1, '#141518'); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.stroke();
    // screen positions
    const P = new Map(); for (const [id, z] of lay.pos) { const d = view2(z); P.set(id, { x: cx + d.re * R, y: cy + d.im * R, d, k: 1 - abs2(d) }); }
    const o = view2(C(0, 0)); P.set('', { x: cx + o.re * R, y: cy + o.im * R, d: o, k: 1 - abs2(o) });
    const topicMatch = id => !S.topics.size || atlas.node.get(id).topics.some(t=>S.topics.has(t)); const vis = id => S.roles.has(atlas.node.get(id).role) && (!S.isolate || topicMatch(id));
    // focus
    const lit = new Set(); if (f.sel) { lit.add(f.sel); for (const nb of atlas.neighbors(f.sel)) lit.add(nb); }
    const relOn = r => S.kinds.has(r.kind === 'variant' ? 'counter' : r.kind === 'teaching' ? 'context' : r.kind) && r.kind !== 'teaching' && vis(r.prereq) && vis(r.dependent);
    const isHot = r => f.focusIds ? r.kind === 'proof' && r.dependent === f.theorem : f.sel ? (r.prereq === f.sel || r.dependent === f.sel) : false;
    // background grid for the geodesic mode: hyperbolic circles and rays around the world origin
    if (mode === 'geodesics') { ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; for (let d = 1; d <= lay.maxLevel; d++) { const rr = Math.tanh(d * STEP / 2); ctx.beginPath(); for (let i = 0; i <= (moving ? 32 : 96); i++) { const t = i / (moving ? 32 : 96) * Math.PI * 2, q = view2(C(Math.cos(t) * rr, Math.sin(t) * rr)); const x = cx + q.re * R, y = cy + q.im * R; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); } for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; const pts = geoPts(C(0, 0), C(Math.cos(t) * .999, Math.sin(t) * .999), moving ? 8 : 24); ctx.beginPath(); pts.forEach((z, j) => { const q = view2(z); const x = cx + q.re * R, y = cy + q.im * R; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); } }
    // ---- relations ---------------------------------------------------------------------------------
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const samples = moving ? 2 : 3, beta = mode === 'branches' ? .7 : .84;
    // Relations are batched: one Path2D per (kind, brightness bucket), so ~20 strokes instead of 1,378.
    const groups = new Map();
    const pathOf = (r, n, out = new Path2D()) => { if (mode === 'geodesics') { const key = r.id + ':' + n; let pts = geodesicCache.get(key); if (!pts) { pts = geoPts(lay.pos.get(r.prereq), lay.pos.get(r.dependent), n); geodesicCache.set(key, pts); } pts.forEach((z, j) => { const q = view2(z); const x = cx + q.re * R, y = cy + q.im * R; j ? out.lineTo(x, y) : out.moveTo(x, y); }); return out; }
      const key = r.prereq + '>' + r.dependent; let path = pathCache.get(key); if (!path) { path = treePath(lay, r.prereq, r.dependent); pathCache.set(key, path); } bspline(out, path.map(id => P.get(id)), beta, samples); return out; };
    const addRel = (r, alpha, w) => { const a = P.get(r.prereq), b = P.get(r.dependent); const near = Math.max(a.k, b.k); const bucket = near > .6 ? 3 : near > .3 ? 2 : near > .1 ? 1 : 0; const gk = r.kind + '|' + bucket + '|' + alpha + '|' + w; let g = groups.get(gk); if (!g) { g = { kind: r.kind, a: alpha * [.42, .6, .82, 1][bucket], w, path: new Path2D() }; groups.set(gk, g); } pathOf(r, moving ? 3 : 12, g.path); };
    const strokeGroups = () => { for (const g of groups.values()) { ctx.strokeStyle = rgba(KC[g.kind], g.a); ctx.lineWidth = g.w; ctx.setLineDash(moving ? [] : dash(g.kind)); ctx.stroke(g.path); } groups.clear(); ctx.setLineDash([]); };
    const base = r => (r.kind === 'definition' ? .11 : r.kind === 'proof' ? .28 : r.kind === 'context' ? .1 : .2) * (mode === 'branches' ? .55 : 1);
    if (mode === 'geodesics' && !moving) ctx.globalCompositeOperation = 'lighter';
    const hot = []; A.frameRecords = {nodes:[], relations:[]};
    for (const r of atlas.rels) { if (!relOn(r)) continue; A.frameRecords.relations.push(r.id); if (isHot(r)) { hot.push(r); continue; } addRel(r, f.sel ? base(r) * .22 : base(r), r.kind === 'proof' ? 1.05 : .75); }
    strokeGroups();
    ctx.globalCompositeOperation = 'source-over';
    // ---- tree branches (branches mode) ----------------------------------------------------------------
    if (mode === 'branches') { const nearestVisible = id => { let cur = tree.parent.get(id); while (cur && !vis(cur)) cur = tree.parent.get(cur); return cur; };
      const trunk = new Set(); if (f.sel) { let cur = f.sel; while (cur) { trunk.add(cur); cur = tree.parent.get(cur); } }
      const bg = new Map();
      for (const id of lay.pos.keys()) { if (!vis(id)) continue; const p = nearestVisible(id); if (!p) continue; const a = P.get(p), b = P.get(id); const near = Math.max(a.k, b.k); if (near < .02) continue; const skips = p !== tree.parent.get(id); const on = trunk.has(id) && trunk.has(p); const n = atlas.node.get(id);
        const w = Math.max(.5, (on ? 3 : .6 + 2.6 * Math.sqrt(tree.leaves.get(id) / tree.maxLeaves)) * (.3 + .7 * near)); const wq = Math.round(w * 2) / 2;
        const gk = n.chapter + '|' + (on ? 1 : 0) + '|' + (skips ? 1 : 0) + '|' + wq; let g = bg.get(gk); if (!g) { g = { ch: n.chapter, on, skips, w: wq, path: new Path2D() }; bg.set(gk, g); }
        const pts = geoPts(lay.pos.get(p), lay.pos.get(id), moving ? 3 : 8); pts.forEach((z, j) => { const q = view2(z); const x = cx + q.re * R, y = cy + q.im * R; j ? g.path.lineTo(x, y) : g.path.moveTo(x, y); }); }
      for (const g of bg.values()) { ctx.strokeStyle = chap(g.ch, g.on ? 70 : f.sel ? 38 : 56, f.sel && !g.on ? 25 : 62); ctx.globalAlpha = f.sel && !g.on ? .45 : .9; ctx.lineWidth = g.w; ctx.setLineDash(g.skips ? [3, 3] : []); ctx.stroke(g.path); }
      ctx.globalAlpha = 1; ctx.setLineDash([]); }
    // hot relations on top
    for (const r of hot) { const dim = f.focusIds && f.hot.size && !f.hot.has(r.prereq); addRel(r, dim ? .35 : 1, r.kind === 'proof' ? 2.2 : 1.6); }
    strokeGroups();
    // ---- rim: the chapter band (each entity projected to the rim) -----------------------------------------
    const byCh = new Map(), rim = new Map();
    for (const [id, p] of P) { if (!id || !vis(id)) continue; const n = atlas.node.get(id); const ang = Math.atan2(p.d.im, p.d.re); let rp = rim.get(n.chapter); if (!rp) { rp = new Path2D(); rim.set(n.chapter, rp); } rp.moveTo(cx + Math.cos(ang - .006) * (R + 9), cy + Math.sin(ang - .006) * (R + 9)); rp.arc(cx, cy, R + 9, ang - .006, ang + .006); const c = byCh.get(n.chapter) || { x: 0, y: 0, n: 0 }; c.x += Math.cos(ang); c.y += Math.sin(ang); c.n++; byCh.set(n.chapter, c); }
    ctx.lineWidth = 2.4; ctx.globalAlpha = .7; for (const [ch, rp] of rim) { ctx.strokeStyle = chap(ch, 60, 60); ctx.stroke(rp); }
    ctx.globalAlpha = 1;
    const mobile = vp.width <= 720, textPad = 8;
    A.labelAudit = { labels: [], rim: [], omittedRim: [], caption: null };
    const shortChapter = {sets:'Set theory',metrics:'Metrics',topology:'Topology',convergence:'Convergence',separation:'Separation',compactness:'Compactness',connectedness:'Connectedness'};
    const usedAng = [], rimBoxes = [];
    for (const ch of atlas.chapters) {
      const c = byCh.get(ch.id); if (!c) continue;
      const omit = reason => A.labelAudit.omittedRim.push({chapter:ch.id,reason});
      if (moving) {omit('name intentionally deferred during motion; chapter ticks remain');continue;}
      const rl = Math.hypot(c.x,c.y)/c.n;
      if (rl < .4) {omit('chapter spread has no stable mean angle');continue;}
      const ang = Math.atan2(c.y,c.x);
      if (usedAng.some(a=>Math.abs(Math.atan2(Math.sin(a-ang),Math.cos(a-ang)))<.38)) {omit('neighbouring chapter name needs this space');continue;}
      const lx=cx+Math.cos(ang)*(R+26),ly=cy+Math.sin(ang)*(R+26);
      let rot=ang+Math.PI/2;if(ang>0&&ang<Math.PI)rot+=Math.PI;
      ctx.font=`600 ${mobile?10:11}px Inter, system-ui, sans-serif`;
      const text=`${ch.number} · ${mobile?shortChapter[ch.id].toUpperCase():ch.title.split(' ').slice(0,3).join(' ').toUpperCase()}`;
      const m=ctx.measureText(text),box=rotatedTextBounds(lx,ly,rot,-m.width/2,-(m.actualBoundingBoxAscent||11),m.width,(m.actualBoundingBoxAscent||11)+(m.actualBoundingBoxDescent||3));
      if(!insideTextBounds(box,vp.width,vp.height,textPad)) {omit('whole name intentionally omitted to stay inside viewport');continue;}
      if(rimBoxes.some(b=>boxesOverlap(box,b))) {omit('whole name intentionally omitted to avoid another name');continue;}
      usedAng.push(ang);rimBoxes.push(box);A.labelAudit.rim.push({chapter:ch.id,text,box});
      ctx.save();ctx.translate(lx,ly);ctx.rotate(rot);ctx.textAlign='center';ctx.fillStyle=chap(ch.id,72,55);ctx.fillText(text,0,0);ctx.restore();
    }
    // ---- nodes ---------------------------------------------------------------------------------------
    const items = [];
    for (const [id, p] of P) { if (!id || !vis(id)) continue; A.frameRecords.nodes.push(id); const n = atlas.node.get(id); const im = lay.imp.get(id);
      const rr = Math.max(1.3, (2 + 8.5 * im * im) * (.22 + .9 * p.k) * Math.pow(S.k, .25));
      const isSel = id === f.sel, isHotN = f.hot.has(id), ring = isSel || isHotN || id === A.hover;
      const dim = !topicMatch(id) || (f.focusIds ? !f.focusIds.has(id) && !f.pathSet.has(id) : f.sel ? !lit.has(id) : false);
      ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = dim ? .28 : 1;
      if (!moving && im > .55 && !dim) { ctx.fillStyle = chap(n.chapter, 60, 70); ctx.globalAlpha = .12; ctx.beginPath(); ctx.arc(0, 0, rr * 2.6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(0, 0, rr * 1.7, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (ring) { ctx.beginPath(); ctx.arc(0, 0, rr + 5, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.beginPath(); if (n.role === 'result') { ctx.moveTo(0, -rr * 1.2); ctx.lineTo(rr * 1.2, 0); ctx.lineTo(0, rr * 1.2); ctx.lineTo(-rr * 1.2, 0); ctx.closePath(); } else if (n.role === 'example') ctx.rect(-rr * .88, -rr * .88, rr * 1.76, rr * 1.76); else ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fillStyle = n.role === 'variant' ? '#16171a' : mode === 'branches' ? chap(n.chapter, 60, 62) : ROLECOL[n.role]; ctx.fill(); ctx.strokeStyle = n.role === 'variant' ? ROLECOL.variant : chap(n.chapter, mode === 'branches' ? 80 : 50, 60); ctx.lineWidth = rr > 4 ? 1.4 : .9; ctx.stroke(); ctx.restore();
      const score = (isSel ? 10 : isHotN ? 6 : lit.has(id) && f.sel ? 3 : 0) + p.k * 1.6 + im * 1.4;
      if (!dim && (p.k > .3 || ring || (im > .7 && p.k > .12))) items.push({ id, n, p, rr, score, isSel }); }
    // ---- labels (radial outward, as in D; horizontal near the centre) ----------------------------------------
    items.sort((a, b) => b.score - a.score); const placed = []; const maxL = moving ? 30 : f.sel ? 80 : 60;
    for (const it of items) { if (placed.length >= maxL) break; const { p, n, rr } = it; const size = Math.round(Math.min(15, 9.5 + 4.5 * p.k + 2.5 * (lay.imp.get(it.id) || 0)));
      let text = (!moving && p.k > .55) || it.isSel ? `${numberLabel(n)}  ${n.short.length > 36 ? n.short.slice(0, 34) + '…' : n.short}` : numberLabel(n);
      ctx.font = `${it.isSel ? '600 ' : ''}${size}px "STIX Two", Georgia, serif`; let w = ctx.measureText(text).width;
      const rad = Math.hypot(p.d.re, p.d.im), ang = Math.atan2(p.d.im, p.d.re);
      let box, draw;
      if (rad < .18 || it.isSel) {
        const half=Math.sqrt(Math.max(0,R*R-(p.y-cy)*(p.y-cy))),lo=Math.max(textPad,cx-half+5),hi=Math.min(vp.width-textPad,cx+half-5);
        const rightStart=p.x+rr+6,leftEnd=p.x-rr-6,rightRoom=hi-rightStart,leftRoom=leftEnd-lo,left=leftRoom>rightRoom;
        const room=Math.max(0,left?leftRoom:rightRoom);
        text=fitCanvasText(text,room,t=>ctx.measureText(t).width);if(!text)continue;w=ctx.measureText(text).width;
        const x=left?leftEnd-w:rightStart,y=Math.max(textPad,Math.min(vp.height-size-textPad,p.y-size/2-1));
        box={x:x-2,y:y-1,w:w+4,h:size+4};draw=()=>{ctx.textAlign='left';ctx.fillText(text,x,y+size-2);};
      }
      else { const left = Math.cos(ang) < 0, off = rr + 5; const room = R * (1 - rad) - off - 4; if (room < 14) continue; if (w > room) { let t = text; while (t.length > 3 && ctx.measureText(t + '…').width > room) t = t.slice(0, -1); text = t + '…'; w = ctx.measureText(text).width; } const x0 = p.x + Math.cos(ang) * off, y0 = p.y + Math.sin(ang) * off, x1 = p.x + Math.cos(ang) * (off + w), y1 = p.y + Math.sin(ang) * (off + w); box = { x: Math.min(x0, x1) - size * .5, y: Math.min(y0, y1) - size * .5, w: Math.abs(x1 - x0) + size, h: Math.abs(y1 - y0) + size }; draw = () => { ctx.save(); ctx.translate(x0, y0); ctx.rotate(left ? ang + Math.PI : ang); ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(text, 0, size * .35); ctx.restore(); }; }
      if (!insideTextBounds(box,vp.width,vp.height,2)) continue;
      if (!moving && placed.some(b => boxesOverlap(box,b))) continue; placed.push(box); A.labelAudit.labels.push({id:it.id,text,selected:it.isSel,box});
      ctx.fillStyle = it.isSel ? '#ffffff' : `rgba(236,236,240,${.45 + .5 * p.k})`; draw(); }
    // caption
    ctx.font='500 10.5px Inter, system-ui, sans-serif';ctx.fillStyle='rgba(236,236,240,.55)';ctx.textAlign='left';
    const instruction=mobile?'Drag · pinch to zoom · tap to centre':`Poincaré disk · click to centre · drag to move · scroll to zoom · zoom ×${S.k.toFixed(2)}`;
    const caption=fitCanvasText(instruction,vp.width-28,t=>ctx.measureText(t).width);ctx.fillText(caption,14,18);
    A.labelAudit.caption={text:caption,box:{x:14,y:7,w:ctx.measureText(caption).width,h:14}};
  }
  // ---- motion ------------------------------------------------------------------------------------------
  const settle = () => { S.moving = true; clearTimeout(S.idle); S.idle = setTimeout(() => { S.moving = false; app.view.requestSettled(); }, 160); app.view.requestSettled(); };
  function stopMotion() { cancelAnimationFrame(S.anim); S.anim = 0; clearTimeout(S.idle); S.moving = false; app?.view.requestSettled(); }
  function animateTo(target, k = S.k, ms = 460) { stopMotion(); const c0 = {...S.centre}, k0 = S.k; let elapsed = 0, previous = null; // move along the geodesic from the current centre to the target
    const tp = mob(target, c0), L = Math.sqrt(abs2(tp)), ah = atanh(Math.min(.9999999, L));
    const step = now => { if (previous !== null) elapsed += Math.min(20, Math.max(0, now - previous)); previous = now; const t = Math.min(1, elapsed / ms), e = t * t * (3 - 2 * t); const s = L > 1e-9 ? Math.tanh(ah * e) / L : 0; S.centre = mobInv(C(tp.re * s, tp.im * s), c0); S.k = k0 + (k - k0) * e; if (t < 1) { S.moving = true; app.view.requestSettled(); S.anim = requestAnimationFrame(step); } else { S.anim = 0; S.centre = {...target}; S.k = k; S.moving = false; app.view.requestSettled(); } }; S.anim = requestAnimationFrame(step); }
  // Where to look when an entity is selected: shift a little from the entity toward the hyperbolic
  // barycentre of its direct relations (so the disk is not half empty), and pick the zoom that puts
  // nearly all of them inside 0.8 of the radius.
  function focusFor(id) { const lay = app.lay, z0 = lay.pos.get(id); const nb = app.atlas.neighbors(id).filter(n => lay.pos.has(n)); if (!nb.length) return { target: z0, k: Math.max(S.k, 1.2) };
    const ws = nb.map(n => mob(lay.pos.get(n), z0)); const m = ws.reduce((a, w) => C(a.re + w.re, a.im + w.im), C(0, 0)); const mm = C(m.re / ws.length * .5, m.im / ws.length * .5); const target = mobInv(mm, z0);
    const ds = [id, ...nb].map(n => 2 * atanh(Math.min(.9999999, Math.sqrt(abs2(mob(lay.pos.get(n), target)))))).sort((a, b) => a - b); const D = ds[Math.floor(ds.length * .9)] || ds.at(-1);
    return { target, k: Math.max(.45, Math.min(2.4, 2 * atanh(.8) / Math.max(.3, D))) }; }
  function hitAt(sx, sy) { const vp = { width: app.view.width, height: app.view.height }, { R, cx, cy } = disk(vp); let best = null, bd = 1e9; for (const [id, z] of app.lay.pos) { const n = app.atlas.node.get(id); if (!S.roles.has(n.role) || (S.isolate && S.topics.size && !n.topics.some(t=>S.topics.has(t)))) continue; const d = view2(z); const x = cx + d.re * R, y = cy + d.im * R; const dd = (x - sx) ** 2 + (y - sy) ** 2; if (dd < bd) { bd = dd; best = id; } } return bd < 13 * 13 ? best : null; }

  app = await bootTreeApp({ name: mode, bind: false, rebuildOnSelect: false, layout, paint,
    onSelect: id => { app.checkpoint?.(); if (id && app.lay.pos.has(id)) { const { target, k } = focusFor(id); animateTo(target, k, 460); } else if (!id) animateTo(C(0, 0), 1); },
    zoomHandler: z => { if (z === 'fit') animateTo(C(0, 0), 1); else animateTo(S.centre, Math.max(.35, Math.min(5, S.k * (z === 'in' ? 1.35 : 1 / 1.35))), 220); },
    fitHandler: () => animateTo(C(0, 0), 1),
    chapterHandler: id => { // centre on the chapter's most used entity
      const ns = app.atlas.chapter.get(id).nodes; const best = ns.reduce((a, b) => (app.lay.imp.get(b.id) > app.lay.imp.get(a.id) ? b : a)); animateTo(app.lay.pos.get(best.id), 1.6); },
    intro: (atlas, A) => intro(atlas, A),
    keyHTML: atlas => `<span class="kgroup"><span class="klabel">Show</span>${ROLES.map(r => `<button class="k" data-role="${r}" aria-pressed="true">${mark(r)}${ROLE_LABEL[r]}s</button>`).join('')}</span><span class="kgroup"><span class="klabel">Lines</span>${KINDS.filter(k => k !== 'implies').map(k => `<button class="k" data-kind="${k}" aria-pressed="true"><i class="line line-${k}"></i>${esc(KIND_LABEL[k])}</button>`).join('')}</span><span class="k muted">size = how often it is used · outline = chapter</span>`,
    onKey: (e) => { const b = e.target.closest('[data-role],[data-kind]'); if (!b) return; const set = b.dataset.role ? S.roles : S.kinds, v = b.dataset.role || b.dataset.kind; if (set.has(v) && (!b.dataset.role || set.size > 1)) set.delete(v); else set.add(v); if (v === 'proof' || v === 'definition') { /* implication follows definition/proof toggles */ if (S.kinds.has('proof') || S.kinds.has('definition')) S.kinds.add('implies'); else S.kinds.delete('implies'); } b.setAttribute('aria-pressed', set.has(v)); app.view.requestSettled(); } });
  // ---- pointer: drag = Möbius translation; click = centre + select; wheel / pinch = hyperbolic zoom ---------
  const el = app.view.canvas; el.style.touchAction = 'none'; let down = null; const pts = new Map(); let pinch = null;
  const toDisk = (sx, sy) => { const { R, cx, cy } = disk({ width: app.view.width, height: app.view.height }); return C((sx - cx) / R, (sy - cy) / R); };
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    // Freeze the displayed camera before establishing any drag or pinch anchor.
    stopMotion(); app.checkpoint?.();
    const r = el.getBoundingClientRect();
    pts.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (pts.size >= 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), k: S.k }; down = null; return; }
    const u = toDisk(e.clientX - r.left, e.clientY - r.top);
    down = { pointer: e.pointerId, x: e.clientX, y: e.clientY, z0: abs2(u) < .998 ? mobInv(unmag(u, S.k), S.centre) : null, moved: false };
  });
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: sx, y: sy });
    if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; S.k = Math.max(.35, Math.min(5, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)); settle(); return; }
    if (down && down.pointer === e.pointerId) { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true; if (!down.moved || !down.z0) return; let u = toDisk(sx, sy); const m = Math.sqrt(abs2(u)); if (m > .985) u = C(u.re * .985 / m, u.im * .985 / m); const w1 = unmag(u, S.k), z0 = down.z0;
      const cn = dragCentre(z0, w1); if (abs2(cn) < .9995) S.centre = cn; settle(); return; }
    if (!pts.size) { const id = hitAt(sx, sy); if (id !== app.hover) app.hoverFn(id); }
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    const was = down; if (was?.pointer !== e.pointerId) return; down = null;
    if (e.type === 'pointercancel' || was.moved || Math.hypot(e.clientX - was.x, e.clientY - was.y) > 5) return;
    const r = el.getBoundingClientRect(), id = hitAt(e.clientX - r.left, e.clientY - r.top);
    if (id) { const same = app.desk.state.selected === id; app.desk.select(id); if (same) { const {target,k}=focusFor(id); animateTo(target,k); } }
    else if (app.desk.state.selected) app.desk.clear();
    else animateTo(C(0, 0), 1);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', e => { pts.delete(e.pointerId); if (down?.pointer === e.pointerId) down = null; if (pts.size < 2) pinch = null; });
  el.addEventListener('pointerleave', () => { if (!pts.size && app.hover) app.hoverFn(null); });
  el.addEventListener('wheel', e => {
    e.preventDefault(); if(!S.moving) app.checkpoint?.(); stopMotion();
    // A wheel gesture during a held pointer must invalidate its old zoom anchor.
    down = null; pinch = null;
    S.k = Math.max(.35, Math.min(5, S.k * Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0016)))); settle();
  }, { passive: false });
  app.view.lowRes = () => S.moving; app.view.lowResScale = 1;
  // hover: redraw the cached frame plus a ring, instead of repainting the whole disk
  const baseHover = app.hoverFn; app.hoverFn = id => { baseHover(id); const v = app.view; if (S.moving || !v.settled) return; const c = v.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(v.settled, 0, 0); if (!id) return; const p = toScreen(app.lay.pos.get(id), { width: v.width, height: v.height }); const k = 1 - abs2(p.d), im = app.lay.imp.get(id); const rr = Math.max(1.3, (2 + 8.5 * im * im) * (.22 + .9 * k) * Math.pow(S.k, .25)); c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); c.beginPath(); c.arc(p.x, p.y, rr + 5, 0, Math.PI * 2); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); };
  settle();
  window.proto.hyper = S; app.checkpoint = () => {S.history.push({centre:{...S.centre},k:S.k}); if(S.history.length>40)S.history.shift(); S.future=[];}; app.travel = back => {const from=back?S.history:S.future,to=back?S.future:S.history,entry=from.pop();if(!entry)return;to.push({centre:{...S.centre},k:S.k});stopMotion();S.centre=entry.centre;S.k=entry.k;settle();}; app.visible = () => ({nodes: app.atlas.nodes.filter(n => S.roles.has(n.role)).map(n => n.id), relations: app.atlas.rels.filter(r => r.kind !== 'teaching' && S.roles.has(app.atlas.node.get(r.prereq).role) && S.roles.has(app.atlas.node.get(r.dependent).role) && S.kinds.has(r.kind === 'variant' ? 'counter' : r.kind === 'teaching' ? 'context' : r.kind)).map(r => r.id)}); window.atlas = window.proto; window.atlas.ready = true;
  document.addEventListener('keydown', e => {if(e.target.closest('input,textarea'))return;const delta={ArrowLeft:[-.08,0],ArrowRight:[.08,0],ArrowUp:[0,-.08],ArrowDown:[0,.08]}[e.key];if(!delta)return;e.preventDefault();stopMotion();app.checkpoint();S.centre=mobInv(C(...delta),S.centre);settle();});
  return app;
}

export function dragCentre(z0, w1) {
 const kk=cmul(w1,z0), mm=csub(z0,w1), den=1-abs2(kk);
 return C((mm.re+kk.re*mm.re+kk.im*mm.im)/den,(mm.im+kk.im*mm.re-kk.re*mm.im)/den);
}

export function screenTransform(z, centre, k) {
    const cr=centre.re, ci=centre.im, nr=z.re-cr, ni=z.im-ci;
    const dr=1-cr*z.re-ci*z.im, di=ci*z.re-cr*z.im, den=dr*dr+di*di;
    const re=(nr*dr+ni*di)/den, im=(ni*dr-nr*di)/den, m=Math.hypot(re,im);
    const scale=m<1e-9?1:Math.tanh(k*Math.atanh(Math.min(m,.9999999)))/m;
    return C(re*scale,im*scale);
}

// Text layout helpers. Omit or ellipsize before drawing rather than relying on canvas clipping.
export function fitCanvasText(text,room,measure) {
 if(room<=0)return '';if(measure(text)<=room)return text;if(measure('…')>room)return '';
 let lo=0,hi=text.length;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(measure(text.slice(0,mid)+'…')<=room)lo=mid;else hi=mid-1;}return text.slice(0,lo).trimEnd()+'…';
}
export function rotatedTextBounds(x,y,angle,left,top,width,height) {
 const c=Math.cos(angle),s=Math.sin(angle),points=[[left,top],[left+width,top],[left,top+height],[left+width,top+height]].map(([a,b])=>({x:x+a*c-b*s,y:y+a*s+b*c}));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
export function insideTextBounds(b,width,height,pad=0){return b.x>=pad&&b.y>=pad&&b.x+b.w<=width-pad&&b.y+b.h<=height-pad;}
function boxesOverlap(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}
