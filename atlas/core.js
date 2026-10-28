import crops from './facsimile-crops.js';
// Semantic view adapter for the original v4 atlas, source text and review notes.
// Derived presentation fields only: 450 entities, 1511 canonical records,
// 132 proofs and 431 steps. No mathematical relation is added here.

export const KIND = {
  proof_uses:       { id: 'proof',      label: 'Used in a proof',        short: 'proof use',   directed: true,  dependency: true },
  uses_definition:  { id: 'definition', label: 'Uses a definition',      short: 'definition',  directed: true,  dependency: true },
  implies:          { id: 'implies',    label: 'Logical implication',    short: 'implies',     directed: true,  dependency: true },
  instantiates:     { id: 'example',    label: 'Example of',             short: 'example',     directed: true,  dependency: false },
  counterexample_to:{ id: 'counter',    label: 'Counterexample to',      short: 'counterexample', directed: true, dependency: false },
  variant_of:       { id: 'variant',    label: 'Editorial variant of',   short: 'variant',     directed: true,  dependency: false },
  related_to:       { id: 'context',    label: 'Editorial comparison',   short: 'comparison',  directed: false, dependency: false },
  teaches_before:   { id: 'teaching',   label: 'Suggested reading order',short: 'reading order', directed: true, dependency: false },
};
export const KINDS = ['proof', 'definition', 'implies', 'example', 'counter', 'variant', 'context', 'teaching'];
export const KIND_LABEL = Object.fromEntries(Object.values(KIND).map(k => [k.id, k.label]));

// Which end is the prerequisite (same convention as v4's graph.mjs: arrows run from a
// prerequisite to what builds on it; comparisons are undirected).
const PREREQ_IS_TO = new Set(['proof_uses', 'uses_definition', 'instantiates', 'variant_of']);

export const ROLE_LABEL = { definition: 'Definition', result: 'Result', example: 'Example', variant: 'Editorial variant' };

export function numberLabel(n) {
  if (/^Unnumbered/.test(n.number)) return 'Unnumbered · p.' + n.page;
  return n.number.replace('Definition ', 'D').replace('Theorem ', 'T').replace('Example ', 'Ex ').replace('Lemma ', 'L')
    .replace('Proposition ', 'P').replace('Corollary ', 'C').replace('Remark ', 'R').replace('Problem ', 'Pr ')
    .replace('Unnumbered definition before T3.104', 'Def · p.55').replace('Editorial variant V1 (not source numbering)', 'V1');
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Atlas reading aids use plain text. Canonical mathematics is rendered by strict KaTeX at build time.
export const math = esc;

export async function loadAtlas(url) {
  const get = async u => { const r = await fetch(u); if (!r.ok) throw Error('Could not load ' + u); return r.json(); };
  const [raw, source, review, latex] = await Promise.all([get(url), get('data/source-text.json'), get('data/review-notes.json'), get('data/latex-source.json')]);
  const atlas = new Atlas(project(raw, source)); atlas.raw = raw; atlas.source = source; atlas.review = review; atlas.latex = latex; return atlas;
}

export class Atlas {
  constructor(data) {
    this.data = data;
    this.nodes = data.nodes; this.edges = data.edges; this.proofs = data.proofs;
    this.node = new Map(this.nodes.map(n => [n.id, n]));
    this.proof = new Map(this.proofs.map(p => [p.id, p]));
    this.chapters = data.regions.slice().sort((a, b) => a.index - b.index).map(r => {
      const c = data.chapters.find(x => x.regionId === r.id) || {};
      return { id: r.id, index: r.index, number: c.number || String(r.index), title: c.title || r.label, start: r.start, end: r.end,
        nodes: this.nodes.filter(n => n.chapter === r.id).sort((a, b) => a.page - b.page || cmpNum(a.number, b.number)) };
    });
    this.chapter = new Map(this.chapters.map(c => [c.id, c]));
    this.proofsOf = new Map(); for (const p of this.proofs) { if (!this.proofsOf.has(p.theorem)) this.proofsOf.set(p.theorem, []); this.proofsOf.get(p.theorem).push(p); }
    this.topics = new Map(data.topics.map(t => [t.id, t.label]));
    this.sections = new Map((data.sections || []).map(s => [s.number, s]));
    this.buildRelationships();
  }
  // Display relationships between entities. proof_uses records are projected onto the
  // theorem each proof proves (via the recorded `proves` record), exactly as in v4.
  buildRelationships() {
    const provesOf = new Map();
    for (const e of this.edges) if (e.type === 'proves') { if (!provesOf.has(e.from)) provesOf.set(e.from, []); provesOf.get(e.from).push(e); }
    const rels = [];
    for (const e of this.edges) {
      if (e.type === 'proves') continue;
      const k = KIND[e.type]; if (!k) continue;
      if (e.type === 'proof_uses') {
        for (const pv of provesOf.get(e.from) || []) rels.push({ id: `${e.id}:${pv.to}`, kind: 'proof', type: e.type, prereq: e.to, dependent: pv.to, directed: true, via: e.from, canonical: [e.id, pv.id], note: e.note, origin: e.origin, review: e.review, occurrences: e.occurrences });
      } else if (this.node.has(e.from) && this.node.has(e.to)) {
        const prereq = PREREQ_IS_TO.has(e.type) ? e.to : e.from, dependent = prereq === e.to ? e.from : e.to;
        rels.push({ id: e.id, kind: k.id, type: e.type, prereq, dependent, directed: k.directed, via: null, canonical: [e.id], note: e.note, origin: e.origin, review: e.review, occurrences: e.occurrences });
      }
    }
    this.rels = rels;
    this.incident = new Map(this.nodes.map(n => [n.id, []]));
    for (const r of rels) { this.incident.get(r.prereq).push(r); this.incident.get(r.dependent).push(r); }
    this.counts = { entities: this.nodes.length, canonical: this.edges.length, displayed: rels.filter(r => r.kind !== 'teaching').length, cross: rels.filter(r => this.node.get(r.prereq).chapter !== this.node.get(r.dependent).chapter).length, proofs: this.proofs.length, steps: this.proofs.reduce((a, p) => a + p.steps.length, 0) };
  }
  // Relations of one entity, grouped by meaning and by side.
  groups(id) {
    const out = [];
    const order = [['proof', 'in'], ['definition', 'in'], ['implies', 'in'], ['proof', 'out'], ['definition', 'out'], ['implies', 'out'], ['example', 'out'], ['example', 'in'], ['counter', 'in'], ['counter', 'out'], ['variant', 'in'], ['variant', 'out'], ['context', 'both'], ['teaching', 'in'], ['teaching', 'out']];
    const titles = {
      'proof:in': 'Results and definitions this proof uses', 'proof:out': 'Used in the proof of',
      'definition:in': 'Definitions used in the statement', 'definition:out': 'Definition used by',
      'implies:in': 'Implied by', 'implies:out': 'Implies',
      'example:out': 'Examples', 'example:in': 'Example of',
      'counter:in': 'Refuted by', 'counter:out': 'Counterexample to',
      'variant:in': 'Editorial variants', 'variant:out': 'Editorial variant of',
      'context:both': 'Editorial comparison (not a dependency)', 'teaching:in': 'Suggested before', 'teaching:out': 'Suggested after',
    };
    for (const [kind, side] of order) {
      const items = this.incident.get(id).filter(r => r.kind === kind && (side === 'both' || (side === 'in' ? r.dependent === id : r.prereq === id)))
        .map(r => ({ r, other: this.node.get(r.prereq === id ? r.dependent : r.prereq) }));
      if (items.length) out.push({ kind, side, title: titles[`${kind}:${side}`], items: dedupe(items) });
    }
    return out;
  }
  neighbors(id) { return [...new Set(this.incident.get(id).map(r => r.prereq === id ? r.dependent : r.prereq))]; }
  // Theorem plus everything its recorded proofs use.
  proofFocus(id) { return [id, ...new Set(this.rels.filter(r => r.kind === 'proof' && r.dependent === id).map(r => r.prereq))]; }
  // Transitive prerequisites through dependency relations (proof use, definition use, implication).
  ancestry(id, { kinds = ['proof', 'definition', 'implies'], maxDepth = 99 } = {}) {
    const depth = new Map([[id, 0]]), via = new Map(), queue = [id];
    for (let i = 0; i < queue.length; i++) { const cur = queue[i], d = depth.get(cur); if (d >= maxDepth) continue;
      for (const r of this.incident.get(cur)) if (kinds.includes(r.kind) && r.dependent === cur && !depth.has(r.prereq)) { depth.set(r.prereq, d + 1); via.set(r.prereq, r); queue.push(r.prereq); } }
    return { depth, via, ids: queue };
  }
  descendants(id, { kinds = ['proof', 'definition', 'implies'], maxDepth = 99 } = {}) {
    const depth = new Map([[id, 0]]), queue = [id];
    for (let i = 0; i < queue.length; i++) { const cur = queue[i], d = depth.get(cur); if (d >= maxDepth) continue;
      for (const r of this.incident.get(cur)) if (kinds.includes(r.kind) && r.prereq === cur && !depth.has(r.dependent)) { depth.set(r.dependent, d + 1); queue.push(r.dependent); } }
    return { depth, ids: queue };
  }
  // Longest recorded prerequisite chain beneath each entity.
  depths() {
    if (this._depths) return this._depths;
    const deps = new Map(this.nodes.map(n => [n.id, []]));
    for (const r of this.rels) if (r.directed && ['proof', 'definition', 'implies'].includes(r.kind)) deps.get(r.dependent).push(r.prereq);
    const memo = new Map(), visiting = new Set();
    const depth = id => { if (memo.has(id)) return memo.get(id); if (visiting.has(id)) return 0; visiting.add(id); const d = Math.max(-1, ...deps.get(id).map(depth)) + 1; visiting.delete(id); memo.set(id, d); return d; };
    this._depths = new Map(this.nodes.map(n => [n.id, depth(n.id)])); return this._depths;
  }
  sectionOf(n) { const s = n.section && this.sections.get(n.section); return s ? `§${s.number} ${s.title}` : `Chapter ${this.chapter.get(n.chapter).number}`; }
  search(q) {
    q = norm(q).trim(); if (!q) return [];
    const num = q.match(/\d+\.\d+/)?.[0], words = q.split(/\s+/), scored = [];
    for (const n of this.nodes) {
      const name = norm(n.en + ' ' + n.short), tokens = name.split(/[^a-z0-9.]+/); let score = 0;
      if (num && norm(n.number).includes(num)) score += 100;
      if (norm(n.en).startsWith(q) || norm(n.short).startsWith(q)) score += 60; else if (words.every(w => tokens.some(t => t.startsWith(w)))) score += 40; else if (name.includes(q)) score += 30;
      if (!score && norm([n.number, n.statement, n.aliases, ...n.excerpts.map(x=>x.text), ...n.topics.map(t => this.topics.get(t))].join(' ')).includes(q)) score = 10;
      if (score) scored.push({ n, score });
    }
    return scored.sort((a, b) => b.score - a.score || a.n.id.localeCompare(b.n.id)).map(x => x.n);
  }
}
function dedupe(items) { const seen = new Set(); return items.filter(x => { const k = x.other.id + '|' + (x.r.via || ''); if (seen.has(k)) return false; seen.add(k); return true; }); }
const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
function cmpNum(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); }

// Source links. The PDF and the rasterised pages are the same files as in v4 dist/source.
export const SOURCE = { base: 'source/', pdf: 'General-Topology-lecture-notes-2025-101pages.pdf' };
export const pdfLink = page => `${SOURCE.base}${SOURCE.pdf}#page=${page}`;
export const facsimileHTML = (fs, label) => (fs || []).map(f => `<svg class="facsimile" viewBox="${f.x} ${f.y} ${f.width} ${f.height}" role="img" aria-label="Original typesetting: ${esc(label)}, PDF page ${f.physicalPage}"><image href="${SOURCE.base}${esc(f.url.replace(/^source\//, ''))}" width="${f.pageWidth}" height="${f.pageHeight}"/></svg>`).join('');

// Chapter palette: one hue per chapter (used by the prototypes that colour by chapter).
export const CHAPTER_HUE = { sets: 28, metrics: 52, topology: 200, convergence: 160, separation: 268, compactness: 338, connectedness: 95 };
export const ROLE_SHAPE = { definition: 'circle', result: 'diamond', example: 'square', variant: 'ring' };

// Draw a role shape on a 2D context, centred at 0,0.
export function shapePath(ctx, role, r) {
  ctx.beginPath();
  if (role === 'result') { ctx.moveTo(0, -r * 1.15); ctx.lineTo(r * 1.15, 0); ctx.lineTo(0, r * 1.15); ctx.lineTo(-r * 1.15, 0); ctx.closePath(); }
  else if (role === 'example') { const s = r * .9; ctx.rect(-s, -s, 2 * s, 2 * s); }
  else ctx.arc(0, 0, r, 0, Math.PI * 2);
}

// Lossless in-memory view adapter. The shipped original JSON files remain untouched.
export function project(raw, source) {
 const occurrences = new Map(raw.occurrences.map(o => [o.id, { ...o, page:o.physicalPage, printed:o.printedPage, number:o.originalNumber }]));
 const occ = ids => (ids || []).map(id => occurrences.get(id)).filter(Boolean);
 const page = ids => occ(ids)[0]?.page;
 const facs = (xs, pg) => xs?.length ? xs : pg ? [{physicalPage:pg,url:`source/pages/page-${String(pg).padStart(3,'0')}.webp`,pageWidth:612,pageHeight:792,x:48,y:40,width:516,height:710}] : [];
 const nodes = raw.nodes.map(n => {const s=source.entities[n.id] || {}; return {...n,short:n.shortLabel || n.en,mobile:n.mobileLabel,env:n.sourceEnvironment,role:n.mathematicalRole,chapter:n.sourceChapterId,section:s.section,page:page(n.occurrences),topics:n.topicIds || [],review:n.review.status,occurrences:occ(n.occurrences),excerpts:(s.excerpts || []).map(x => ({...x,facsimiles:facs(x.facsimiles || crops[n.id],x.page)}))};});
 const proofs = raw.proofs.map(p => ({...p,sourcePage:page(p.occurrences),facsimiles:facs(p.facsimiles || crops[p.id],page(p.occurrences)),steps:p.steps.map(s => ({...s,facsimiles:facs(s.facsimiles || crops[s.id],s.physicalPage)}))}));
 const edges = raw.edges.map(e => ({...e,from:e.fromId,to:e.toId,review:e.review.status,occurrences:occ(e.occurrences)}));
 return {...raw,nodes,proofs,edges,chapters:source.chapters,sections:source.sections};
}
