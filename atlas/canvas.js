// Shared cached-bitmap canvas camera.
//
// Performance model (the same in every prototype):
//  * The complete picture (edges, marks, labels) is painted once into an offscreen
//    bitmap at the current camera ("settled frame").
//  * During pan / wheel / pinch the settled bitmap is only re-blitted with a transform:
//    one drawImage per frame, no path geometry, no label search.
//  * 140 ms after the last input, one crisp settled frame is painted again.
//  * Selection / hover changes paint one settled frame (a few ms for 1,378 curves).
//  * Nothing animates continuously. There is no live label repulsion.
export class CanvasView {
  constructor(canvas, { paint, hit, onClick, onHover, onIdle, minZoom = .05, maxZoom = 6, lockY = null, bind = true } = {}) {
    this.lockY = lockY; // when set, the camera's y never changes (one-dimensional pan/zoom)
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.paint = paint; this.hit = hit; this.onClick = onClick; this.onHover = onHover; this.onIdle = onIdle;
    this.minZoom = minZoom; this.maxZoom = maxZoom;
    this.cam = { x: 0, y: 0, z: 1 };
    this.settled = document.createElement('canvas'); this.settledCam = null;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.gesture = null; this.idleTimer = 0; this.frame = 0; this.pointers = new Map();
    this.stats = { settledPaints: 0, blits: 0, lastSettledMs: 0 };
    if (bind) this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width)); this.height = Math.max(1, Math.round(r.height));
    for (const c of [this.canvas, this.settled]) { c.width = Math.round(this.width * this.dpr); c.height = Math.round(this.height * this.dpr); }
    this.canvas.style.width = this.width + 'px'; this.canvas.style.height = this.height + 'px';
    this.requestSettled();
  }
  // world <-> screen
  toScreen(p) { return { x: p.x * this.cam.z + this.cam.x, y: p.y * this.cam.z + this.cam.y }; }
  toWorld(x, y) { return { x: (x - this.cam.x) / this.cam.z, y: (y - this.cam.y) / this.cam.z }; }
  // insets: screen areas covered by chrome (e.g. a bottom sheet) that fit() keeps clear.
  fit(bounds, pad = 40, maxZoom = 1.6, animate = false) {
    const ins = this.insets || { top: 0, bottom: 0, left: 0, right: 0 }, W = this.width - ins.left - ins.right, H = this.height - ins.top - ins.bottom;
    const z = Math.max(this.minZoom, Math.min(maxZoom, (W - 2 * pad) / (bounds.maxX - bounds.minX || 1), (H - 2 * pad) / (bounds.maxY - bounds.minY || 1)));
    const cam = { z, x: ins.left + (W - (bounds.maxX + bounds.minX) * z) / 2, y: ins.top + (H - (bounds.maxY + bounds.minY) * z) / 2 };
    if (animate) this.animateTo(cam); else { this.cam = cam; this.requestSettled(); }
  }
  // Short, single camera tween (≤ 320 ms) that uses blits only, then settles.
  animateTo(target, duration = 320) {
    const from = { ...this.cam }, t0 = performance.now(); cancelAnimationFrame(this.anim);
    const step = now => { const t = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - t, 3);
      this.cam = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e };
      if (t < 1) { this.blit(); this.anim = requestAnimationFrame(step); } else { this.anim = 0; this.requestSettled(); } };
    this.anim = requestAnimationFrame(step);
  }
  // Paint a settled frame into the offscreen bitmap and show it.
  paintSettled() {
    const t = performance.now();
    // While a non-affine view is moving (lowRes() true), paint at 1x and stretch: 4x fewer pixels on retina.
    const low = this.lowRes?.() && this.dpr > 1;
    let target = this.settled, d = this.dpr;
    if (low) { d = this.lowResScale || 1; if (!this.lowCanvas) this.lowCanvas = document.createElement('canvas'); const w = Math.round(this.width * d), h = Math.round(this.height * d); if (this.lowCanvas.width !== w || this.lowCanvas.height !== h) { this.lowCanvas.width = w; this.lowCanvas.height = h; } target = this.lowCanvas; }
    const ctx = target.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    this.paint(ctx, this.cam, { width: this.width, height: this.height });
    this.settledCam = low ? null : { ...this.cam };
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height); if (low) c.drawImage(target, 0, 0, this.canvas.width, this.canvas.height); else c.drawImage(this.settled, 0, 0);
    this.stats.settledPaints++; this.stats.lastSettledMs = performance.now() - t;
  }
  requestSettled() { if (this.frame) return; this.frame = requestAnimationFrame(() => { this.frame = 0; this.paintSettled(); this.onIdle?.(); }); }
  // Re-blit the settled bitmap under the current camera (gesture frames).
  blit() {
    if (!this.settledCam) return this.paintSettled();
    const s = this.settledCam, k = this.cam.z / s.z, x = this.cam.x - s.x * k, y = this.cam.y - s.y * k, c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(k, 0, 0, k, x * this.dpr, y * this.dpr); c.drawImage(this.settled, 0, 0);
    this.stats.blits++;
  }
  requestBlit() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.blit(); }); clearTimeout(this.idleTimer); this.idleTimer = setTimeout(() => { this.idleTimer = 0; this.requestSettled(); }, 140); }
  zoomAt(factor, sx, sy) { const z = Math.max(this.minZoom, Math.min(this.maxZoom, this.cam.z * factor)), f = z / this.cam.z; this.cam = { z, x: sx - (sx - this.cam.x) * f, y: this.lockY != null ? this.lockY(z) : sy - (sy - this.cam.y) * f }; this.requestBlit(); }
  bind() {
    const el = this.canvas; el.style.touchAction = 'none';
    el.addEventListener('wheel', e => { e.preventDefault(); const r = el.getBoundingClientRect(); const f = Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0015)); this.zoomAt(f, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.pointers.size === 1) this.gesture = { x0: e.clientX, y0: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false }; else if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: this.cam.x, cy: this.cam.y }; } });
    el.addEventListener('pointermove', e => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && this.pinch) { const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = el.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top; const z = Math.max(this.minZoom, Math.min(this.maxZoom, this.pinch.z * d / this.pinch.d)), f = z / this.pinch.z; this.cam = { z, x: mx - (this.pinch.mx - r.left - this.pinch.cx) * f, y: my - (this.pinch.my - r.top - this.pinch.cy) * f }; this.requestBlit(); return; }
      if (this.gesture && this.pointers.size === 1) { const dx = e.clientX - this.gesture.x0, dy = e.clientY - this.gesture.y0; if (Math.hypot(dx, dy) > 3) this.gesture.moved = true; if (this.gesture.moved) { this.cam.x = this.gesture.cx + dx; if (this.lockY == null) this.cam.y = this.gesture.cy + dy; this.requestBlit(); } return; }
      if (!this.gesture && this.hit && this.onHover) { const r = el.getBoundingClientRect(); const id = this.hit(e.clientX - r.left, e.clientY - r.top); if (id !== this.hoverId) { this.hoverId = id; this.onHover(id, e); } }
    });
    const up = e => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = null; if (this.gesture && this.pointers.size === 0) { const g = this.gesture; this.gesture = null; if (!g.moved && this.hit) { const r = el.getBoundingClientRect(); this.onClick?.(this.hit(e.clientX - r.left, e.clientY - r.top), e); } } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { if (!this.gesture && this.hoverId) { this.hoverId = null; this.onHover?.(null); } });
  }
}

// Uniform grid for hit-testing node positions in world space.
export class Grid {
  constructor(items, cell = 60) { this.cell = cell; this.map = new Map(); for (const it of items) { const k = this.key(it.x, it.y); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(it); } }
  key(x, y) { return (Math.floor(x / this.cell)) + ',' + (Math.floor(y / this.cell)); }
  nearest(x, y, radius) { let best = null, bd = radius * radius; const c = this.cell, i0 = Math.floor((x - radius) / c), i1 = Math.floor((x + radius) / c), j0 = Math.floor((y - radius) / c), j1 = Math.floor((y + radius) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const it of this.map.get(i + ',' + j) || []) { const d = (it.x - x) ** 2 + (it.y - y) ** 2; if (d < bd) { bd = d; best = it; } } return best; }
}

// Greedy label placement in screen space, run only inside settled paints.
// Candidates are ordered by priority; each label takes the first free slot of four.
export function placeLabels(items, width, height, measure, { pad = 2, max = Infinity } = {}) {
  const placed = [], out = []; const grid = new Map(); const C = 64;
  const free = b => { const i0 = Math.floor(b.x / C), i1 = Math.floor((b.x + b.w) / C), j0 = Math.floor(b.y / C), j1 = Math.floor((b.y + b.h) / C); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const o of grid.get(i + ',' + j) || []) if (b.x < o.x + o.w + pad && o.x < b.x + b.w + pad && b.y < o.y + o.h + pad && o.y < b.y + b.h + pad) return false; return true; };
  const take = b => { placed.push(b); const i0 = Math.floor(b.x / C), i1 = Math.floor((b.x + b.w) / C), j0 = Math.floor(b.y / C), j1 = Math.floor((b.y + b.h) / C); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i + ',' + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); } };
  for (const it of items) { if (it.block) take(it.block); }
  let n = 0;
  for (const it of items) {
    if (it.block || n >= max) continue;
    const { w, h } = measure(it); const r = it.r + 3;
    const cands = it.anchors || [[it.x - w / 2, it.y + r], [it.x - w / 2, it.y - r - h], [it.x + r, it.y - h / 2], [it.x - r - w, it.y - h / 2]];
    for (const [x, y] of cands) { const b = { x, y, w, h }; if (x < 0 || y < 0 || x + w > width || y + h > height) continue; if (free(b)) { take(b); out.push({ ...it, box: b }); n++; break; } }
  }
  return out;
}
