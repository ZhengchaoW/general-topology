import { esc } from './core.js';
// HTML is generated exclusively from the byte-preserved canonical TeX at build time.
// Missing mappings are visible; the frozen PDF transcript is never a fallback.
export function sourceRecords(atlas,n) { return (atlas.latex.entities[n.id]?.keys||[]).map(k=>atlas.latex.records[k]); }
export function sourceSpan(record) {return `<a class="src" href="source/latex-current/${esc(record.file)}" target="_blank" rel="noopener">${esc(record.file)}:${record.startLine}–${record.endLine}</a>`;}
export function latexStatement(atlas,n) {
 const entry=atlas.latex.entities[n.id];
 if(entry?.editorial)return `<section class="note editorial"><b>Atlas editorial variant · no canonical LaTeX environment</b><p>${esc(n.statement)}</p>${n.formula?`<p>${esc(n.formula)}</p>`:''}</section>`;
 const records=sourceRecords(atlas,n);
 if(!records.length)return `<section class="source-gap" role="status"><b>Source mapping needs review</b><p>${esc(entry?.gap||n.number+' has no verified canonical source span.')} Open the current source chapter to inspect the original LaTeX.</p><button data-source-chapter="${esc(n.number.match(/\d+/)?.[0]||'1')}">Read current source chapter</button></section>`;
 return records.map(r=>`<section class="latex-source source-statement" data-source-key="${r.key}"><div class="source-caption"><b>Current notes · ${esc(r.kind)} ${r.number}</b>${sourceSpan(r)}</div>${entry.atlasNumber!==r.kind[0].toUpperCase()+r.kind.slice(1)+' '+r.number?`<p class="small source-edition">Atlas label: ${esc(entry.atlasNumber)}. Complete current source environment follows; the graph retains its frozen edition numbering.</p>`:''}${r.html}</section>`).join('');
}
export function latexProof(atlas,p) {
 const n=atlas.node.get(p.theorem),records=sourceRecords(atlas,n),proofs=records.flatMap(r=>r.proofs);
 if(!proofs.length)return `<p class="source-gap">No separately mapped canonical proof for ${esc(n.number)}. ${records.length?'The complete environment above may contain its argument.':'Source mapping needs review.'}</p>`;
 return proofs.map(r=>`<section class="latex-source source-proof"><div class="source-caption"><b>Original LaTeX proof</b>${sourceSpan(r)}</div>${r.html}</section>`).join('');
}
export function sourceChapterHTML(atlas,number,html) {const ch=atlas.latex.chapters.find(c=>c.number===String(number));return `<article class="source-chapter latex-source"><h2>Current notes · Chapter ${esc(number)}</h2><p class="small">Original canonical LaTeX prose and mathematics. Source: <a href="source/latex-current/${esc(ch.file)}">${esc(ch.file)}</a>. The graph retains frozen edition labels.</p>${html}</article>`;}
