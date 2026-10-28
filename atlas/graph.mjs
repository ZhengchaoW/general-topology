// Semantic records -> inspectable display relationships -> course-structured layout.
// Everything here is derived from data/atlas.json; nothing mathematical is added.
export const LAYERS=[
 {id:'proof',label:'Used in a proof',note:'A recorded proof uses this result or definition.'},
 {id:'definition',label:'Uses a definition',note:'The statement is phrased with this definition.'},
 {id:'example',label:'Example of',note:'The example satisfies the definition.'},
 {id:'variant',label:'Variant · counterexample',note:'Editorial variant of a theorem, and what refutes it.'},
 {id:'context',label:'Editorial comparison',note:'Topical comparison only, not a dependency.'},
 {id:'implication',label:'Logical implication',note:'An implication explicitly stated or proved in the notes; different from use in a proof.'},
 {id:'teaching',label:'Suggested reading order',note:'Off by default; not teacher-confirmed.'}
];
export const DEFAULT_LAYERS=LAYERS.filter(x=>x.id!=='teaching').map(x=>x.id);
const layerFor={uses_definition:'definition',proof_uses:'proof',instantiates:'example',counterexample_to:'variant',variant_of:'variant',related_to:'context',implies:'implication',teaches_before:'teaching'};
const labels={uses_definition:'Uses definition',instantiates:'Instantiates',counterexample_to:'Counterexample to variant',variant_of:'Variant of',related_to:'Editorial comparison',implies:'Logical implication',teaches_before:'Suggested reading order'};
// Which end of a record is the prerequisite. Arrows run from a prerequisite to what
// builds on it (the Leitfaden convention); comparisons are undirected.
const direction={proof_uses:['to','arrow'],uses_definition:['to','arrow'],instantiates:['to','arrow'],variant_of:['to','arrow'],counterexample_to:['from','bar'],implies:['from','arrow'],teaches_before:['from','arrow'],related_to:['from','none']};
// How a relationship reads from each of its two ends.
export const PHRASES={
 proof_uses:{dependent:'Used in this proof',prereq:'Used in the proof of'},
 uses_definition:{dependent:'Uses definition',prereq:'Definition used by'},
 instantiates:{dependent:'Example of',prereq:'Examples'},
 counterexample_to:{dependent:'Refuted by',prereq:'Counterexample to'},
 variant_of:{dependent:'Editorial variant of',prereq:'Editorial variants'},
 related_to:{dependent:'Editorial comparison',prereq:'Editorial comparison'},
 implies:{dependent:'Implied by',prereq:'Implies'},
 teaches_before:{dependent:'Suggested after',prereq:'Suggested before'}
};
function orient(type,fromId,toId){const [end,marker]=direction[type]||['to','arrow'];return{type,prereqId:end==='to'?toId:fromId,dependentId:end==='to'?fromId:toId,directed:marker!=='none',marker};}
const displayCache=new WeakMap();
export function buildDisplayGraph(data,layers=DEFAULT_LAYERS){
 const cache=displayCache.get(data)||new Map(),key=[...layers].sort().join('|');displayCache.set(data,cache);if(cache.has(key))return cache.get(key);
 const entityIds=new Set(data.nodes.map(n=>n.id)),relationships=[],omitted=[];
 for(const r of data.edges){
  if(r.type==='proves'){omitted.push({canonicalId:r.id,reason:'Proof identity retained as projection provenance; proof object collapsed.'});continue;}
  const layer=layerFor[r.type];
  if(!layers.includes(layer)){omitted.push({canonicalId:r.id,reason:`Layer ${layer} disabled.`});continue;}
  if(r.type==='proof_uses'){
   const proving=data.edges.filter(e=>e.type==='proves'&&e.fromId===r.fromId);
   for(const p of proving)relationships.push({id:`display:${r.id}:${p.toId}`,fromId:p.toId,toId:r.toId,layer,kind:'proof_dependency_projection',label:`Proof ${data.proofs.find(x=>x.id===r.fromId)?.label||r.fromId} uses`,viaProofId:r.fromId,canonicalRelationIds:[r.id,p.id],occurrences:[...new Set([...r.occurrences,...p.occurrences])],origin:r.origin,reviewStatus:r.review.status,...orient(r.type,p.toId,r.toId)});
  }else if(entityIds.has(r.fromId)&&entityIds.has(r.toId))relationships.push({id:`display:${r.id}`,fromId:r.fromId,toId:r.toId,layer,kind:'canonical_entity_relationship',label:labels[r.type],canonicalRelationIds:[r.id],occurrences:r.occurrences,origin:r.origin,reviewStatus:r.review.status,...orient(r.type,r.fromId,r.toId)});
 }
 const result=bundle({version:3,nodes:data.nodes,relationships,omitted,canonicalRecordCount:data.edges.length});cache.set(key,result);return result;
}
// Parallel meanings between two entities share a stroke for accounting only;
// the renderer draws every meaning as its own path.
export function bundle(manifest){
 const grouped=new Map();
 for(const r of manifest.relationships){const key=[r.fromId,r.toId].sort().join('|');if(!grouped.has(key))grouped.set(key,{id:`stroke:${key}`,fromId:r.fromId,toId:r.toId,relationshipIds:[],layers:[],canonicalRelationIds:[]});const s=grouped.get(key);s.relationshipIds.push(r.id);s.layers=[...new Set([...s.layers,r.layer])];s.canonicalRelationIds=[...new Set([...s.canonicalRelationIds,...r.canonicalRelationIds])];}
 const strokes=[...grouped.values()];
 return {...manifest,strokes,counts:{canonicalRecords:manifest.canonicalRecordCount,displayRelationships:manifest.relationships.length,projectedRelationships:manifest.relationships.filter(r=>r.kind==='proof_dependency_projection').length,strokes:strokes.length,nodes:manifest.nodes.length,omittedCanonical:manifest.omitted.length}};
}
// A proof focus only highlights (focusIds); the surrounding network stays drawn.
// Only the explicit "isolate topics" control removes entities.
export function visibleGraph(data,state){
 const m=buildDisplayGraph(data,state.relationLayers);let nodes=m.nodes;
 if(state.topicMode==='isolate'&&state.topicIds.length)nodes=nodes.filter(n=>n.topicIds.some(t=>state.topicIds.includes(t))||n.id===state.selectedEntityId);
 const focusIds=state.neighborhood==='proof'&&state.selectedEntityId?proofFocus(data,state.selectedEntityId):null;
 const ids=new Set(nodes.map(n=>n.id));return {...bundle({...m,nodes,relationships:m.relationships.filter(r=>ids.has(r.fromId)&&ids.has(r.toId))}),focusIds};
}
// A theorem together with every entity its recorded proofs use.
export function proofFocus(data,id){const proofs=data.edges.filter(e=>e.type==='proves'&&e.toId===id).map(e=>e.fromId);return [id,...new Set(data.edges.filter(e=>e.type==='proof_uses'&&proofs.includes(e.fromId)).map(e=>e.toId))];}
export function neighbors(manifest,id){return [...new Set(manifest.relationships.filter(r=>r.fromId===id||r.toId===id).map(r=>r.fromId===id?r.toId:r.fromId))];}
// Longest chain of recorded prerequisites beneath each entity (0: none recorded).
export function dependencyDepth(data){
 const deps=new Map(data.nodes.map(n=>[n.id,[]]));
 for(const r of buildDisplayGraph(data,LAYERS.map(l=>l.id)).relationships)if(r.directed&&r.layer!=='teaching')deps.get(r.dependentId)?.push(r.prereqId);
 const memo=new Map(),visiting=new Set(),depth=id=>{if(memo.has(id))return memo.get(id);if(visiting.has(id))return 0;visiting.add(id);const d=Math.max(-1,...deps.get(id).map(depth))+1;visiting.delete(id);memo.set(id,d);return d;};
 return Object.fromEntries(data.nodes.map(n=>[n.id,depth(n.id)]));
}
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
const unit=(a,b)=>hash(a+b)/4294967296;
// Labels wrap at word boundaries so long names stay compact around their node.
export function wrapLabel(s,max){const lines=[''];for(const w of s.split(' '))if(lines.at(-1)&&(lines.at(-1)+' '+w).length>max)lines.push(w);else lines[lines.length-1]=(lines.at(-1)+' '+w).trim();return lines;}
export const nodeName=(n,mobile)=>mobile?n.mobileLabel||n.shortLabel:n.shortLabel;
export function labelBox(n,mobile=false){const lines=wrapLabel(nodeName(n,mobile),mobile?12:18);return{w:Math.max(...lines.map(l=>l.length*(mobile?6.1:7.2)),numberLabel(n).length*(mobile?5.6:6.2))+8,h:14+lines.length*(mobile?13:16),lines};}
export function modeledChapters(data){return data.regions.filter(r=>data.nodes.some(n=>n.sourceChapterId===r.id)).sort((a,b)=>a.index-b.index);}
// Deterministic, ID-seeded layout with mathematical structure. The course axis follows
// the chapters of the notes; the depth axis follows the longest recorded prerequisite
// chain, prerequisites first. Each chapter's depth levels become rows (ordered by the
// mean position of their prerequisites to limit crossings); a bounded force pass then
// relaxes the grid and keeps every node and label box clear of the others.
// Horizontal: chapters left to right, prerequisites on top. Vertical (phones): chapters
// top to bottom, each a short top-down flow.
export function courseLayout(data,{orientation='horizontal',seed='atlas-v3',iterations=500}={}){
 if(data.nodes.length>80)return fullCourseLayout(data,{orientation,seed});
 const horizontal=orientation==='horizontal',mobile=!horizontal,depth=dependencyDepth(data),chapters=modeledChapters(data),rels=buildDisplayGraph(data).relationships;
 const slot=horizontal?150:92,levelGap=horizontal?112:66,cap=horizontal?3:4,pad=horizontal?44:22,head=horizontal?30:42,W=horizontal?0:380,P={},bands=[],zig=j=>(j%2?1:-1)*(horizontal?14:11);
 const prereqs=id=>rels.filter(r=>r.directed&&r.dependentId===id).map(r=>r.prereqId);
 let cursor=0;
 for(const c of chapters){
  const members=data.nodes.filter(n=>n.sourceChapterId===c.id),levels=[...new Set(members.map(n=>depth[n.id]))].sort((a,b)=>a-b),rows=[];
  for(const level of levels){
   const at=members.filter(n=>depth[n.id]===level),bary=n=>{const xs=prereqs(n.id).map(id=>P[id]?.[horizontal?'x':'x']).filter(x=>x!=null);return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;};
   at.sort((a,b)=>(bary(a)??1e9)-(bary(b)??1e9)||a.number.localeCompare(b.number,undefined,{numeric:true}));
   for(let i=0;i<at.length;i+=cap)rows.push({level,nodes:at.slice(i,i+cap),sub:i/cap});
   // Rows are placed level by level so that later levels can order by their prerequisites.
   if(horizontal){const width=Math.min(cap,Math.max(...levels.map(l=>members.filter(n=>depth[n.id]===l).length)))*slot;rows.filter(r=>r.level===level).forEach((r,i,all)=>r.nodes.forEach((n,j)=>{P[n.id]={x:cursor+pad/2+(width-r.nodes.length*slot)/2+slot*(j+.5)+(all.length>1?(i%2?.3:-.3)*slot:0),y:pad+head+level*levelGap+i*levelGap*.48+zig(j)};}));}
  }
  if(horizontal){const width=Math.max(...rows.map(r=>r.nodes.length))*slot+pad;bands.push({id:c.id,index:c.index,label:c.label,start:+cursor.toFixed(1),end:+(cursor+width).toFixed(1)});cursor+=width;}
  else{const start=cursor;rows.forEach((r,i)=>r.nodes.forEach((n,j)=>{P[n.id]={x:W/2+(j-(r.nodes.length-1)/2)*slot,y:cursor+pad+head+i*levelGap+zig(j)};}));cursor+=pad*2+head+(rows.length-1)*levelGap+8;bands.push({id:c.id,index:c.index,label:c.label,start:+start.toFixed(1),end:+cursor.toFixed(1)});}
 }
 const width=horizontal?cursor:W,height=horizontal?Math.max(...Object.values(P).map(p=>p.y))+pad+40:cursor,band=Object.fromEntries(bands.map(b=>[b.id,b]));
 const nodes=[...data.nodes].sort((a,b)=>a.id.localeCompare(b.id)),home=Object.fromEntries(nodes.map(n=>[n.id,{...P[n.id]}]));
 for(const n of nodes){P[n.id].x+=(unit(seed,n.id)-.5)*10;P[n.id].y+=(unit(n.id,seed)-.5)*10;}
 const box=n=>{const b=labelBox(n,mobile);return{w:Math.max(b.w,24)+(horizontal?22:10),h:b.h+(horizontal?30:22)};};
 for(let k=0;k<iterations;k++){
  const cool=1-k/(iterations*1.1),F=Object.fromEntries(nodes.map(n=>[n.id,{x:0,y:0}]));
  for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
   const i=nodes[a],j=nodes[b],p=P[i.id],q=P[j.id],dx=p.x-q.x,dy=p.y-q.y,A=box(i),B=box(j),ox=(A.w+B.w)/2-Math.abs(dx),oy=(A.h+B.h)/2-Math.abs(dy);
   // Keep each node, with its label box below it, clear of every other one.
   if(ox>0&&oy>0){let fx=0,fy=0;if(ox/(A.w+B.w)<oy/(A.h+B.h))fx=Math.sign(dx||unit(i.id,j.id)-.5)*ox*.25;else fy=Math.sign(dy||unit(j.id,i.id)-.5)*oy*.25;F[i.id].x+=fx;F[i.id].y+=fy;F[j.id].x-=fx;F[j.id].y-=fy;}
  }
  for(const r of rels){const p=P[r.fromId],q=P[r.toId],dx=q.x-p.x,dy=q.y-p.y,d=Math.max(1,Math.hypot(dx,dy)),pull=(d-slot)*.0015;F[r.fromId].x+=dx/d*pull;F[r.fromId].y+=dy/d*pull;F[r.toId].x-=dx/d*pull;F[r.toId].y-=dy/d*pull;}
  for(const n of nodes){
   const p=P[n.id],h=home[n.id],b=band[n.sourceChapterId],f=F[n.id],half=box(n).w/2;
   f.x+=(h.x-p.x)*.06;f.y+=(h.y-p.y)*.06;p.x+=Math.max(-6,Math.min(6,f.x))*cool;p.y+=Math.max(-6,Math.min(6,f.y))*cool;
   if(horizontal)p.x=Math.max(b.start+Math.min(half,(b.end-b.start)/2-2),Math.min(b.end-Math.min(half,(b.end-b.start)/2-2),p.x));else{p.x=Math.max(half,Math.min(W-half,p.x));p.y=Math.max(b.start+pad+head*.7,Math.min(b.end-pad*.6,p.y));}
  }
 }
 return {orientation,width:+width.toFixed(1),height:+height.toFixed(1),bands,depth,positions:Object.fromEntries(Object.entries(P).map(([id,p])=>[id,{x:+p.x.toFixed(2),y:+p.y.toFixed(2)}]))};
}
// The full course uses the same course axis and role marks. All entities and real
// semantic edges persist at every zoom; chapter navigation changes only the camera.
// Page order supplies reading rows, while a small deterministic displacement avoids
// rigid walls. There are no aggregate nodes and no invented chapter-to-chapter edges.
function fullCourseLayout(data,{orientation,seed}){
 const horizontal=orientation==='horizontal',depth=dependencyDepth(data),chapters=modeledChapters(data),positions={},bands=[];
 const page=n=>data.occurrences.find(o=>o.id===n.occurrences[0]).physicalPage;
 let cursor=0,maxAcross=0;
 for(const c of chapters){
  const ns=data.nodes.filter(n=>n.sourceChapterId===c.id).sort((a,b)=>page(a)-page(b)||a.number.localeCompare(b.number,undefined,{numeric:true}));
  const cols=horizontal?Math.max(3,Math.ceil(Math.sqrt(ns.length*.22))):4,rows=Math.ceil(ns.length/cols),sx=horizontal?94:142,sy=horizontal?84:116,pad=horizontal?24:64;
  const width=cols*sx+pad*2,height=rows*sy+pad*2+52;
  ns.forEach((n,i)=>{const row=Math.floor(i/cols),col=i%cols;
   positions[n.id]={x:+((horizontal?cursor:0)+pad+(col+.5)*sx+(unit(seed,n.id)-.5)*26).toFixed(2),y:+((horizontal?0:cursor)+pad+52+(row+.4)*sy+(unit(n.id,seed)-.5)*20).toFixed(2)};
  });
  const extent=horizontal?width:height;bands.push({id:c.id,index:c.index,label:c.label,start:cursor,end:cursor+extent});cursor+=extent;maxAcross=Math.max(maxAcross,horizontal?height:width);
 }
 return{orientation,width:horizontal?cursor:maxAcross,height:horizontal?maxAcross:cursor,bands,depth,positions};
}
export function bounds(nodes,positions,pad={x:72,top:34,bottom:48}){
 return {minX:Math.min(...nodes.map(n=>positions[n.id].x-pad.x)),maxX:Math.max(...nodes.map(n=>positions[n.id].x+pad.x)),minY:Math.min(...nodes.map(n=>positions[n.id].y-pad.top)),maxY:Math.max(...nodes.map(n=>positions[n.id].y+pad.bottom))};
}
export function fitCamera(nodes,positions,width,height,padding=28,maxZoom=1.45,labelPad){
 if(!nodes.length)return{x:0,y:0,z:1};const b=bounds(nodes,positions,labelPad),z=Math.max(.015,Math.min((width-2*padding)/(b.maxX-b.minX),(height-2*padding)/Math.max(1,b.maxY-b.minY),maxZoom));return{x:(width-(b.maxX+b.minX)*z)/2,y:(height-(b.maxY+b.minY)*z)/2,z};
}
// ---- Proof structure -------------------------------------------------------
export function unsupportedSteps(proof,removedId){const lost=new Set(removedId?[removedId]:[]);for(const s of proof.steps)if(s.inputs.some(id=>lost.has(id)))lost.add(s.id);return proof.steps.filter(s=>lost.has(s.id)).map(s=>s.id);}
export function inferenceGroups(proof){return proof.steps.filter(s=>s.inputs.length).map(s=>({id:`inference:${s.id}`,rule:s.inferenceRule,inputs:s.inputs,resources:s.resources,conclusion:s.id,scope:s.scope,discharges:s.discharges}));}
// Steps that use an assumption directly, and the steps that inherit that use.
export function assumptionUse(proof,id){const direct=proof.steps.filter(s=>s.inputs.includes(id)).map(s=>s.id),all=new Set(unsupportedSteps(proof,id));return{direct,downstream:proof.steps.filter(s=>all.has(s.id)&&!direct.includes(s.id)).map(s=>s.id)};}
// For each entity a proof uses: the steps citing it and their recorded origin.
export function proofToolSupport(proof){const out={};for(const s of proof.steps)for(const r of s.resources)(out[r]||=[]).push({stepId:s.id,index:s.index,origin:s.origin});return out;}
export const RULES={
 source_argument:{symbol:'·',label:'Source passage',long:'A reading step in the source argument. Reading order alone does not assert a logical dependency.'},
 joint_application:{symbol:'∧',label:'All required',long:'Every listed premise is needed together; none is an alternative.'},
 universal_generalization:{symbol:'∀',label:'Generalize',long:'C was arbitrary, so the conclusion holds for every closed C. This is universal generalization, not Boolean AND.'},
 inverse_function_and_closed_preimage:{symbol:'∧',label:'All required',long:'Bijectivity gives the inverse function; closed preimages give its continuity.'},
 introduce_arbitrary_closed_subset:{symbol:'∀',label:'Arbitrary',long:'Introduce an arbitrary closed subset and open the local scope C.'}
};
// Hypotheses and conclusion, read only from fields already in the data: a recorded
// proof's global assumptions, or the conjunctive "A ∧ B ⇒ C" shape of `formula`.
export function statementStructure(node,data){
 if(!['result','variant'].includes(node.mathematicalRole))return null;
 const proof=data.proofs.find(p=>p.theorem===node.id),f=node.formula||'',split=(s,sep)=>s.split(sep).map(x=>x.trim()).filter(Boolean);
 if(proof?.id==='gt:p001')return{kind:'implication',source:'proof',hypotheses:proof.assumptions.filter(a=>a.scope==='gt:scope:global').map(a=>({id:a.id,text:a.label})),conclusion:[...proof.steps].sort((a,b)=>b.index-a.index)[0].title};
 if(f.includes('⇏')){const [l,r]=split(f,'⇏');return{kind:'non-implication',source:'formula',hypotheses:split(l,/\s[∧+]\s/).map(text=>({text})),conclusion:r};}
 if(f.includes('⇒')){const [l,r]=split(f,'⇒');return{kind:'implication',source:'formula',hypotheses:split(l,' ∧ ').map(text=>({text})),conclusion:r};}
 if(f.includes('⇔')){const [l,r]=split(f,'⇔');return{kind:'equivalence',source:'formula',left:l,right:r};}
 return null;
}
// ---- Labels, search, sources -------------------------------------------------
export function numberLabel(n){return n.number.replace('Definition ','D').replace('Theorem ','T').replace('Example ','Ex. ').replace('Lemma ','L').replace('Unnumbered definition before T3.104','Def. · p.55').replace('Editorial variant V1 (not source numbering)','Variant V1');}
const norm=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'');
// Ranked: source numbers, then names, then any text (statements, aliases, topics, and
// optional extra text per entity such as the printed statement).
export function searchNodes(data,q,extra={}){
 q=norm(q).trim();if(!q)return [];
 const num=q.match(/\d+\.\d+/)?.[0],words=q.split(/\s+/),scored=[];
 for(const n of data.nodes){
  const name=norm(n.en+' '+n.shortLabel),tokens=name.split(/[^a-z0-9.]+/);let score=0;
  if(num&&norm(n.number).includes(num))score+=100;
  if(norm(n.en).startsWith(q)||norm(n.shortLabel).startsWith(q))score+=60;else if(words.every(w=>tokens.some(t=>t.startsWith(w))))score+=40;else if(name.includes(q))score+=30;
  if(!score&&norm([n.number,n.statement,n.aliases,...n.topicIds,extra[n.id]].join(' ')).includes(q))score=10;
  if(score)scored.push({n,score});
 }
 return scored.sort((a,b)=>b.score-a.score||a.n.id.localeCompare(b.n.id)).map(x=>x.n);
}
export function pdfLink(data,o){return `${data.source.url.replace(/^\//,'./')}#page=${o.physicalPage}`;}
// Course spine: every chapter of the notes on one page axis; modeled entities as ticks.
export function courseSpine(data){
 const occ=id=>data.occurrences.find(o=>o.id===id),stack={};
 const ticks=data.nodes.map(n=>({id:n.id,page:occ(n.occurrences[0]).physicalPage,role:n.mathematicalRole})).sort((a,b)=>a.page-b.page||a.id.localeCompare(b.id));
 for(const t of ticks)t.row=stack[t.page]=(stack[t.page]??-1)+1;
 return {pages:data.source.pages,segments:data.regions.map(r=>({id:r.id,index:r.index,label:r.label,start:r.start,end:r.end,modeled:data.nodes.filter(n=>n.sourceChapterId===r.id).length})),ticks};
}

// Return an inspectable directed prerequisite path, with exact display and canonical
// identities. Context comparisons and example/variant links cannot masquerade as proof.
export function prerequisitePath(data,fromId,toId){
 const m=buildDisplayGraph(data),allowed=m.relationships.filter(r=>r.directed&&['proof','definition','implication'].includes(r.layer)),queue=[fromId],prev=new Map([[fromId,null]]);
 for(let i=0;i<queue.length&&!prev.has(toId);i++)for(const r of allowed)if(r.prereqId===queue[i]&&!prev.has(r.dependentId)){prev.set(r.dependentId,{node:queue[i],r});queue.push(r.dependentId);}
 if(!prev.has(toId))return null;const nodeIds=[toId],relationships=[];let at=toId;
 while(prev.get(at)){const p=prev.get(at);relationships.unshift(p.r);nodeIds.unshift(p.node);at=p.node;}
 return{nodeIds,relationshipIds:relationships.map(r=>r.id),canonicalRelationIds:[...new Set(relationships.flatMap(r=>r.canonicalRelationIds))]};
}
