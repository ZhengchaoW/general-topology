// Dependency trees shared by the tree family (H and its variants).
// Whole course: every entity hangs from its deepest recorded prerequisite (longest chain
// beneath it; ties broken by the later page). Selected entity: breadth-first over its
// prerequisites; the parent is the cone node that first reaches it. Every tree edge is a
// recorded relation; which of several prerequisites is the trunk is a drawing choice.
export const DEP = ['proof', 'definition', 'implies'];
export function prereqIndex(atlas) { const PRE = new Map(atlas.nodes.map(n => [n.id, []])); for (const r of atlas.rels) if (DEP.includes(r.kind)) PRE.get(r.dependent).push(r); return PRE; }
export function courseTree(atlas, PRE) {
  const depths = atlas.depths(); const parent = new Map(), via = new Map();
  for (const n of atlas.nodes) { const ps = PRE.get(n.id).filter(r => depths.get(r.prereq) < depths.get(n.id)); if (!ps.length) continue; ps.sort((a, b) => depths.get(b.prereq) - depths.get(a.prereq) || atlas.node.get(b.prereq).page - atlas.node.get(a.prereq).page); parent.set(n.id, ps[0].prereq); via.set(n.id, ps[0]); }
  const roots = atlas.nodes.filter(n => !parent.has(n.id)).map(n => n.id);
  return finish(atlas, { parent, via, roots, members: new Set(atlas.nodes.map(n => n.id)), rootId: null });
}
export function coneTree(atlas, PRE, id) {
  const depths = atlas.depths(); const parent = new Map(), via = new Map(), order = [id], seen = new Set([id]);
  for (let i = 0; i < order.length; i++) { const cur = order[i]; const ps = PRE.get(cur).slice().sort((a, b) => depths.get(b.prereq) - depths.get(a.prereq)); for (const r of ps) if (!seen.has(r.prereq)) { seen.add(r.prereq); parent.set(r.prereq, cur); via.set(r.prereq, r); order.push(r.prereq); } }
  return finish(atlas, { parent, via, roots: [id], members: seen, rootId: id });
}
function finish(atlas, t) {
  const chIndex = new Map(atlas.chapters.map((c, i) => [c.id, i]));
  t.children = new Map(); for (const id of t.members) t.children.set(id, []);
  for (const [c, p] of t.parent) t.children.get(p).push(c);
  const sortKids = ids => ids.sort((a, b) => chIndex.get(atlas.node.get(a).chapter) - chIndex.get(atlas.node.get(b).chapter) || atlas.node.get(a).page - atlas.node.get(b).page);
  for (const ks of t.children.values()) sortKids(ks); sortKids(t.roots);
  t.leaves = new Map(); const count = id => { const ks = t.children.get(id); const v = ks.length ? ks.reduce((s, k) => s + count(k), 0) : 1; t.leaves.set(id, v); return v; };
  for (const r of t.roots) count(r);
  t.size = new Map(); const sz = id => { const v = 1 + t.children.get(id).reduce((s, k) => s + sz(k), 0); t.size.set(id, v); return v; }; for (const r of t.roots) sz(r);
  t.level = new Map(); const lv = (id, l) => { t.level.set(id, l); for (const k of t.children.get(id)) lv(k, l + 1); }; for (const r of t.roots) lv(r, t.rootId ? 0 : 1);
  t.maxLeaves = Math.max(...t.leaves.values()); t.totalLeaves = t.roots.reduce((s, r) => s + t.leaves.get(r), 0);
  return t;
}
