import {numberLabel,labelBox,nodeName} from './graph.mjs';
export {numberLabel};
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,v);parent?.append(e);return e;};
// One shape per mathematical role (shape and color carry the same meaning, so the key
// still reads without color). Radii are used to end edges at the node outline.
const SHAPES={
 definition:{r:6,d:r=>`M${-r},0a${r},${r} 0 1,0 ${2*r},0a${r},${r} 0 1,0 ${-2*r},0`},
 result:{r:7.5,d:r=>`M0,${-r}L${r},0L0,${r}L${-r},0Z`},
 example:{r:6,d:r=>{const s=r*.86,c=2;return `M${-s+c},${-s}H${s-c}Q${s},${-s} ${s},${-s+c}V${s-c}Q${s},${s} ${s-c},${s}H${-s+c}Q${-s},${s} ${-s},${s-c}V${-s+c}Q${-s},${-s} ${-s+c},${-s}Z`;}},
 variant:{r:6.5,d:r=>`M${-r},0a${r},${r} 0 1,0 ${2*r},0a${r},${r} 0 1,0 ${-2*r},0`}
};
const FEATURED='gt:e018';
const OVERVIEW_NUMBERS=new Set(['Definition 1.6','Definition 1.21','Definition 2.1','Definition 3.1','Definition 3.55','Definition 3.83','Definition 3.102','Definition 3.110','Definition 4.15','Definition 5.18','Definition 6.3','Theorem 6.20','Definition 7.2','Definition 7.21']);
const radius=n=>(SHAPES[n.mathematicalRole]||SHAPES.definition).r*(n.id===FEATURED?1.3:1);
const overlap=(a,b,m=0)=>a.x<b.x+b.w+m&&b.x<a.x+a.w+m&&a.y<b.y+b.h+m&&b.y<a.y+a.h+m;
const edgePath=(r,parallel,a,b,ra,rb)=>{
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy)),ux=dx/len,uy=dy/len,bend=Math.min(56,len*.09)+parallel*14;
 const cx=(a.x+b.x)/2-uy*bend,cy=(a.y+b.y)/2+ux*bend;
 const sx=cx-a.x,sy=cy-a.y,sl=Math.hypot(sx,sy)||1,ex=b.x-cx,ey=b.y-cy,el=Math.hypot(ex,ey)||1;
 ra+=2.5;rb+=r.marker==='none'?2.5:3.5;
 return `M${(a.x+sx/sl*ra).toFixed(1)},${(a.y+sy/sl*ra).toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${(b.x-ex/el*rb).toFixed(1)},${(b.y-ey/el*rb).toFixed(1)}`;
};
export class SVGRenderer{
 constructor(svg,{onSelect,onStroke,onHover,onEdgeHover,onNodeDown}={}){
  this.svg=svg;Object.assign(this,{onSelect,onStroke,onHover,onEdgeHover,onNodeDown});this.widths=new Map();
  const ctx=document.createElement('canvas').getContext('2d');
  // Text is measured with the real fonts; widths are cached per string and font.
  this.measure=(text,font)=>{const key=font+'|'+text;if(!this.widths.has(key)){ctx.font=font;this.widths.set(key,ctx.measureText(text).width);}return this.widths.get(key);};
  document.fonts?.ready.then(()=>{this.widths.clear();this.dirty=true;for(const e of this.bandEls||[])e.boundsKey='';});
  svg.addEventListener('click',e=>{if(performance.now()<(this.ignoreClickUntil||0))return;const node=e.target.closest('[data-node]'),edge=e.target.closest('[data-rel]');if(node)this.onSelect?.(node.dataset.node);else if(edge)this.onStroke?.(edge.dataset.rel);});
  svg.addEventListener('keydown',e=>{const node=e.target.closest('.graph-node');if(node&&['Enter',' '].includes(e.key)){e.preventDefault();this.onSelect?.(node.dataset.node);}});
  svg.addEventListener('pointerover',e=>{const n=e.target.closest('[data-node]'),r=e.target.closest('.edge-hit');if(n)this.onHover?.(n.dataset.node,e);else if(r)this.onEdgeHover?.(r.dataset.rel,e);});
  svg.addEventListener('pointerout',e=>{const to=e.relatedTarget;if(e.target.closest('[data-node]')&&!to?.closest?.('[data-node]'))this.onHover?.(null,e);if(e.target.closest('.edge-hit')&&!to?.closest?.('.edge-hit'))this.onEdgeHover?.(null,e);});
  svg.addEventListener('pointerdown',e=>{const n=e.target.closest('.graph-node');if(n)this.onNodeDown?.(n.dataset.node,e);});
 }
 build(manifest,mobile){
  const svg=this.svg;svg.replaceChildren();this.mobile=mobile;
  // The entrance animation plays once; rebuilding after a filter change must not replay it.
  if(!this.built){svg.classList.add('intro');setTimeout(()=>svg.classList.remove('intro'),1800);this.built=true;}
  make('title',{},svg).textContent='General Topology: connected mathematical network';
  this.desc=make('desc',{},svg);
  const defs=make('defs',{},svg);
  for(const layer of ['proof','definition','example','variant','implication','teaching']){const m=make('marker',{id:`arrow-${layer}`,class:`marker marker-${layer}`,viewBox:'0 0 10 10',refX:'8.6',refY:'5',markerWidth:'8',markerHeight:'8',markerUnits:'userSpaceOnUse',orient:'auto'},defs);make('path',{d:'M1.2,1.4 L9,5 L1.2,8.6 L3,5 Z'},m);}
  const bar=make('marker',{id:'bar-variant',class:'marker marker-variant',viewBox:'0 0 10 10',refX:'8',refY:'5',markerWidth:'9',markerHeight:'9',markerUnits:'userSpaceOnUse',orient:'auto'},defs);make('path',{d:'M8,0.5V9.5',class:'bar'},bar);
  this.bandLayer=make('g',{class:'band-layer','aria-hidden':'true'},svg);
  // The complete drawing shares one affine camera transform during motion.
  // Chapter furniture stays in screen space. No mathematical paths are removed.
  this.worldLayer=make('g',{class:'world-layer'},svg);this.inMotion=false;
  this.edgeLayer=make('g',{class:'edge-layer'},this.worldLayer);this.hitLayer=make('g',{class:'edge-hit-layer'},this.worldLayer);
  this.nodeLayer=make('g',{class:'node-layer'},this.worldLayer);this.labelLayer=make('g',{class:'label-layer','aria-hidden':'true'},this.worldLayer);
  this.edges=new Map();this.nodes=new Map();this.labels=new Map();this.bandEls=[];this.labelLayout=null;
  this.incidentEdges=new Map(manifest.nodes.map(n=>[n.id,new Set()]));
  const pairs={};
  for(const r of manifest.relationships){const key=[r.fromId,r.toId].sort().join('|');(pairs[key]||=[]).push(r.id);}
  for(const r of manifest.relationships){
   const key=[r.fromId,r.toId].sort().join('|'),group=pairs[key],stroke=manifest.strokes.find(s=>s.relationshipIds.includes(r.id));
   const marker=r.marker==='bar'?'url(#bar-variant)':r.marker==='arrow'?`url(#arrow-${r.layer})`:null;
   const path=make('path',{class:`edge layer-${r.layer} type-${r.type} origin-${r.origin}`,'data-rel':r.id,'data-stroke':stroke.id,...(marker?{'marker-end':marker}:{})},this.edgeLayer);
   const hit=make('path',{class:'edge-hit','data-rel':r.id},this.hitLayer);
   const item={r,path,hit,parallel:group.indexOf(r.id)-(group.length-1)/2};this.edges.set(r.id,item);
   this.incidentEdges.get(r.fromId).add(item);this.incidentEdges.get(r.toId).add(item);
  }
  manifest.nodes.forEach((n,i)=>{
   const shape=SHAPES[n.mathematicalRole]||SHAPES.definition,rad=radius(n);
   const g=make('g',{class:`graph-node role-${n.mathematicalRole}${n.id===FEATURED?' featured':''}`,'data-node':n.id,tabindex:'0',role:'button','aria-label':`${n.number}. ${n.en}. ${n.mathematicalRole}. Pending teacher review.`,style:`--i:${i}`},this.nodeLayer);
   make('circle',{class:'node-hit',r:mobile?20:16},g);make('circle',{class:'node-halo',r:rad+8},g);
   if(n.id===FEATURED)make('circle',{class:'node-orbit',r:rad+5},g);
   make('path',{class:'node-shape',d:shape.d(rad)},g);
   if(this.flagged?.has(n.id))make('circle',{class:'review-dot',cx:rad+2.5,cy:-rad-2.5,r:2.6},g);
   const t=make('title',{},g);t.textContent=`${n.number} · ${n.en}`;
   const box=labelBox(n,mobile),label=make('g',{class:'node-label','data-node':n.id},this.labelLayer),num=make('text',{class:'node-number','text-anchor':'middle'},label);num.textContent=numberLabel(n);
   const name=make('text',{class:'node-name','text-anchor':'middle'},label),lines=nodeName(n,mobile)===numberLabel(n)?[]:box.lines;
   lines.forEach((line,j)=>{const ts=make('tspan',{x:0,dy:j?(mobile?13:16):0},name);ts.textContent=line;});
   this.nodes.set(n.id,{n,g,rad});this.labels.set(n.id,{n,label,num,name,lines});
  });
  this.signature=this.sign(manifest,mobile);
 }
 sign(manifest,mobile){return mobile+'|'+manifest.nodes.map(n=>n.id).join()+'|'+manifest.relationships.map(r=>r.id).join();}
 labelSize(item,mode){
  const nf=this.mobile?'500 9.5px Inter, system-ui, sans-serif':'500 10px Inter, system-ui, sans-serif',tf=this.mobile?'12.5px "Atlas Serif", Georgia, serif':'14.5px "Atlas Serif", Georgia, serif';
  const numW=this.measure(numberLabel(item.n),nf)*1.06,lineH=this.mobile?13:16;
  if(mode==='number'||!item.lines.length)return{w:numW+6,h:13};
  return{w:Math.max(numW,...item.lines.map(l=>this.measure(l,tf)))+6,h:13+item.lines.length*lineH+2};
 }
 render(manifest,positions,state,{width,height,mobile=false,hoverId=null,hoverRelId=null,resourceIds=[],bands=[],orientation='horizontal',searchIds=null,obstacles=[],expandedChapter=null,motion=false}={}){
  if(this.signature!==this.sign(manifest,mobile))this.build(manifest,mobile);
  this.worldLayer.removeAttribute('transform');
  this.manifest=manifest;this.positions=positions;this.state=state;this.viewport={width,height,mobile};this.options={width,height,mobile,bands,orientation,searchIds,obstacles,expandedChapter};
  this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  this.desc.textContent=`${manifest.nodes.length} entities and ${manifest.relationships.length} drawn relationships. Arrows point from a prerequisite to what uses it. Use the companion list for equivalent keyboard access.`;
  const c=state.camera,P=id=>({x:positions[id].x*c.z+c.x,y:positions[id].y*c.z+c.y}),large=manifest.nodes.length>80;
  // At overview scale the marks get smaller, while role shapes and every recorded
  // path stay present. Zoom exposes the existing labels; nothing is aggregated.
  this.svg.classList.toggle('course-scale',large&&c.z<.3);
  for(const item of this.nodes.values()){
   const scale=large?Math.max(.30,Math.min(1,c.z*2.7)):1;
   item.rad=radius(item.n)*scale;item.g.querySelector('.node-shape').setAttribute('transform',`scale(${scale})`);
   item.g.querySelector('.node-halo').setAttribute('r',item.rad+5);
  }
  const S=Object.fromEntries(manifest.nodes.map(n=>[n.id,P(n.id)]));
  // --- emphasis ---
  const active=hoverId||state.selectedEntityId,incident=r=>r.fromId===active||r.toId===active;
  const near=new Set([active,...resourceIds]);for(const r of manifest.relationships)if(active&&incident(r)){near.add(r.fromId);near.add(r.toId);}
  const focus=manifest.focusIds?new Set(manifest.focusIds):null,topics=state.topicIds.length&&state.topicMode==='highlight'?new Set(manifest.nodes.filter(n=>n.topicIds.some(t=>state.topicIds.includes(t))).map(n=>n.id)):null,search=searchIds?new Set(searchIds):null;
  // A proof focus ("what this proof uses") takes precedence over plain neighborhood.
  const dimNode=id=>!!((expandedChapter&&!active&&!focus&&this.nodes.get(id).n.sourceChapterId!==expandedChapter)||(focus?!focus.has(id)&&id!==hoverId:active&&!near.has(id))||(topics&&!topics.has(id))||(search&&!search.has(id)));
  // --- bands (course chapters) ---
  this.renderBands(bands,orientation,c,width,height);
  // --- edges ---
  for(const {r,path,hit,parallel} of this.edges.values()){
   const a=S[r.prereqId],b=S[r.dependentId],na=this.nodes.get(r.prereqId),nb=this.nodes.get(r.dependentId);
   const d=edgePath(r,parallel,a,b,na.rad,nb.rad);
   path.setAttribute('d',d);hit.setAttribute('d',d);
   const isFocus=focus&&focus.has(r.fromId)&&focus.has(r.toId)&&(r.layer==='proof'||r.fromId===state.selectedEntityId),emph=(active&&incident(r))||r.id===hoverRelId||isFocus;
   const dim=!emph&&((active&&!incident(r))||(focus&&!isFocus)||(topics&&!(topics.has(r.fromId)&&topics.has(r.toId)))||(search&&!(search.has(r.fromId)||search.has(r.toId)))||(expandedChapter&&!active&&!focus&&!(na.n.sourceChapterId===expandedChapter&&nb.n.sourceChapterId===expandedChapter)));
   path.classList.toggle('emphasized',!!emph);path.classList.toggle('dim',!!dim);path.classList.toggle('hovered',r.id===hoverRelId);
  }
  // --- nodes ---
  for(const {n,g} of this.nodes.values()){
   const p=S[n.id];g.setAttribute('transform',`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
   const cls=g.classList;cls.toggle('selected',n.id===state.selectedEntityId);cls.toggle('hover',n.id===hoverId);cls.toggle('dim',dimNode(n.id));cls.toggle('neighbor',!!active&&near.has(n.id)&&n.id!==active);
   cls.toggle('in-focus',!!focus?.has(n.id));cls.toggle('topic-match',!!topics?.has(n.id));cls.toggle('search-match',!!search?.has(n.id));cls.toggle('resource-active',resourceIds.includes(n.id));
   g.setAttribute('aria-pressed',String(n.id===state.selectedEntityId));
  }
  if(motion&&this.labelLayout)this.moveLabels(S);
  else{
   this.placeLabels(manifest,S,{width,height,active,near,dimNode,resourceIds,focus,z:c.z,obstacles,expandedChapter});
   this.labelLayout=this.labelBoxes.map(b=>({...b,dx:b.x-S[b.id].x,dy:b.y-S[b.id].y}));
  }
  this.nodeScreens=S;this.baseScreens=S;this.baseLabelBoxes=this.labelBoxes;this.baseCamera={...c};this.dirty=false;
 }
 // Camera frames reuse the already drawn paths, marks and label placement. Rebase
 // at modest scale changes so text/marks never grow more than 30% before refinement.
 // The final idle render restores exact screen-size marks and collision placement.
 renderCamera(c){
  if(!this.baseCamera||this.dirty)return false;
  const b=this.baseCamera,k=c.z/b.z;
  if(k>1.3||k<1/1.3)return false;
  const x=c.x-b.x*k,y=c.y-b.y*k;
  this.svg.classList.toggle('course-scale',this.manifest.nodes.length>80&&c.z<.3);
  this.worldLayer.setAttribute('transform',`matrix(${k} 0 0 ${k} ${x} ${y})`);
  const {width,height,bands,orientation}=this.options;
  this.renderBands(bands,orientation,c,width,height);
  this.nodeScreens=Object.fromEntries(Object.entries(this.baseScreens).map(([id,p])=>[id,{x:p.x*k+x,y:p.y*k+y}]));
  this.labelBoxes=this.baseLabelBoxes.map(p=>({...p,x:p.x*k+x,y:p.y*k+y,w:p.w*k,h:p.h*k}));
  return true;
 }
 // Springs change positions, so their real edge geometry is updated. Text follows
 // its existing anchor without a new collision search on every physics frame.
 moveLabels(S,moved=null){
  this.labelBoxes=this.labelLayout.map(b=>{
   const box={...b,x:S[b.id].x+b.dx,y:S[b.id].y+b.dy};
   if(!moved||moved.has(b.id))this.labels.get(b.id).label.setAttribute('transform',`translate(${(box.x+box.w/2).toFixed(1)},${box.y.toFixed(1)})`);return box;
  });
 }
 renderMotion(positions,c){
  const b=this.baseCamera;
  if(!b||this.dirty||this.worldLayer.getAttribute('transform')||b.x!==c.x||b.y!==c.y||b.z!==c.z)return false;
  this.setMotion(true);
  const S=this.baseScreens,moved=new Set(),edges=new Set();
  for(const [id,item] of this.nodes){
   const p={x:positions[id].x*c.z+c.x,y:positions[id].y*c.z+c.y},old=S[id];
   // Subpixel accumulation is compared with the last drawn position; the final
   // resting render always restores the exact original geometry, without a cutoff.
   if(Math.hypot(p.x-old.x,p.y-old.y)<.02)continue;
   S[id]=p;moved.add(id);item.g.setAttribute('transform',`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
   for(const edge of this.incidentEdges.get(id))edges.add(edge);
  }
  for(const {r,path,hit,parallel} of edges){const d=edgePath(r,parallel,S[r.prereqId],S[r.dependentId],this.nodes.get(r.prereqId).rad,this.nodes.get(r.dependentId).rad);path.setAttribute('d',d);hit.setAttribute('d',d);}
  if(moved.size){this.moveLabels(S,moved);this.baseLabelBoxes=this.labelBoxes;}
  this.nodeScreens=S;return true;
 }
 setMotion(active){if(this.worldLayer&&this.inMotion!==active){this.inMotion=active;this.worldLayer.classList.toggle('in-motion',active);}}
 // Chapter titles stay pinned to the top (or left, on phones) of their band and wrap
 // to the band's width on screen, so narrow chapters never collide with their neighbors.
 renderBands(bands,orientation,c,width,height){
  const g=this.bandLayer,horizontal=orientation==='horizontal';
  if(this.bandEls.length!==bands.length){g.replaceChildren();this.bandEls=bands.map(()=>({rule:make('line',{class:'band-rule'},g),label:make('text',{class:'band-label'},g),pages:make('text',{class:'band-pages'},g),key:''}));}
  bands.forEach((b,i)=>{
   const e=this.bandEls[i],off=horizontal?c.x:c.y,s0=b.start*c.z+off,s1=b.end*c.z+off,x=horizontal?Math.max(14,Math.min(s0+14,s1-70)):12,room=horizontal?Math.max(64,s1-x-12):Math.min(width*.6,260);
   const words=b.label.toUpperCase().split(' '),lines=[''],max=Math.max(7,Math.floor((room-24)/7.4));
   for(const w of words)if(lines.at(-1)&&(lines.at(-1)+' '+w).length>max)lines.push(w);else lines[lines.length-1]=(lines.at(-1)+' '+w).trim();
   if(horizontal&&s1-s0<130){lines.splice(0,lines.length,`CHAPTER ${b.mark}`);}
   const key=lines.join('|');
   if(e.key!==key){e.key=key;e.label.replaceChildren();lines.forEach((line,j)=>{if(!j&&!line.startsWith('CHAPTER'))make('tspan',{class:'band-roman'},e.label).textContent=b.mark+' ';const t=make('tspan',j?{x:0,dy:'13'}:{},e.label);t.textContent=line;});e.pages.textContent=b.pages;}
   const y=horizontal?18:Math.max(16,Math.min(s0+17,s1-24-lines.length*13)),hidden=horizontal?s1<40||s0>width-40:s1<20||s0>height-20;
   e.x=x;e.y=y;e.pagesY=y+lines.length*13+2;e.offscreen=hidden;
   e.label.setAttribute('x',x);e.label.setAttribute('y',y);e.label.querySelectorAll('tspan[dy]').forEach(t=>t.setAttribute('x',x));e.pages.setAttribute('x',x);e.pages.setAttribute('y',y+lines.length*13+2);
   e.label.classList.toggle('offscreen',hidden);e.pages.classList.toggle('offscreen',hidden);
   const rule=horizontal?{x1:s0,x2:s0,y1:0,y2:height}:{x1:0,x2:width,y1:s0,y2:s0};for(const [k,v] of Object.entries(rule))e.rule.setAttribute(k,v);e.rule.classList.toggle('first',i===0);
  });
 }
 // Greedy, priority-ordered placement in screen space: the selection and its
 // neighbors claim room first; a label that cannot fit falls back to its number, then
 // hides (it remains available on hover, in the panel and in the companion list).
 placeLabels(manifest,S,{width,height,active,near,dimNode,resourceIds,focus,z,obstacles=[],expandedChapter=null}){
  // Chapter titles and the floating controls are obstacles labels must not slide under.
  // getBBox after geometry writes synchronously lays out the whole SVG. Glyph
  // bounds depend on text/font, not the camera: measure only a changed title and
  // translate those exact bounds thereafter (including the real font's offsets).
  const bandBoxes=this.bandEls.filter(e=>!e.offscreen).flatMap(e=>{
   if(e.boundsKey!==e.key){e.boundsKey=e.key;e.bounds=[e.label,e.pages].map((t,i)=>{const b=t.getBBox();return{dx:b.x-e.x,dy:b.y-(i?e.pagesY:e.y),w:b.width,h:b.height};});}
   return e.bounds.map((b,i)=>({x:e.x+b.dx-3,y:(i?e.pagesY:e.y)+b.dy-2,w:b.w+6,h:b.h+4}));
  }).filter(b=>b.w>6);
  const placed=[...obstacles,...bandBoxes],nodeBoxes=manifest.nodes.map(n=>{const p=S[n.id],r=this.nodes.get(n.id).rad+3;return{id:n.id,x:p.x-r,y:p.y-r,w:2*r,h:2*r};});
  const rank=n=>(n.id===active?0:near.has(n.id)&&active?1:resourceIds.includes(n.id)?1:n.id===FEATURED?2:focus?.has(n.id)?2:dimNode(n.id)?6:n.mathematicalRole==='result'?3:n.mathematicalRole==='definition'?4:5);
  const order=[...manifest.nodes].sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id)),compact=this.mobile?z<.62:z<.5;
  this.labelBoxes=[];
  for(const n of order){
   const item=this.labels.get(n.id),p=S[n.id],r=this.nodes.get(n.id).rad;
   const offscreen=p.x<0||p.x>width||p.y<0||p.y>height;
   const lod=manifest.nodes.length>80&&z<.3&&n.sourceChapterId!==expandedChapter&&rank(n)>1&&!OVERVIEW_NUMBERS.has(n.number);
   if(offscreen||lod){item.label.classList.add('hidden');continue;}
   const modes=compact&&rank(n)>2?['number']:['full','number'];let chosen=null;
   for(const mode of modes){
    const {w,h}=this.labelSize(item,mode),cands=[[-w/2,r+4],[-w/2,-r-4-h],[r+7,-h/2],[-r-7-w,-h/2],[3,r+2],[-w-3,r+2],[3,-r-2-h],[-w-3,-r-2-h]];
    for(const [ox,oy] of cands){const box={x:p.x+ox,y:p.y+oy,w,h};if(box.x<2||box.y<2||box.x+w>width-2||box.y+h>height-2)continue;if(placed.some(o=>overlap(box,o,1))||nodeBoxes.some(o=>o.id!==n.id&&overlap(box,o)))continue;chosen={box,mode};break;}
    if(chosen)break;
   }
   const {label,num,name}=item;
   label.classList.toggle('hidden',!chosen);label.classList.toggle('number-only',chosen?.mode==='number');
   label.classList.toggle('dim',dimNode(n.id));label.classList.toggle('active',n.id===active);label.classList.toggle('resource-label',resourceIds.includes(n.id));
   if(!chosen)continue;
   placed.push(chosen.box);this.labelBoxes.push({id:n.id,...chosen.box,mode:chosen.mode});
   const {box}=chosen;label.setAttribute('transform',`translate(${(box.x+box.w/2).toFixed(1)},${box.y.toFixed(1)})`);num.setAttribute('y',9.5);name.setAttribute('y',this.mobile?24:26);name.querySelectorAll('tspan').forEach((t,i)=>t.setAttribute('dy',i?(this.mobile?13:16):0));
  }
 }
 emphasize(active,state,resourceIds=[]){if(this.manifest)this.render(this.manifest,this.positions,state,{...this.options,hoverId:active===state.selectedEntityId?null:active,resourceIds});}
 destroy(){this.svg.replaceChildren();}
}
