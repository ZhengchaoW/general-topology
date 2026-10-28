import {createStore} from './state.mjs';
import {LAYERS,PHRASES,RULES,visibleGraph,proofFocus,fitCamera,neighbors,unsupportedSteps,assumptionUse,proofToolSupport,statementStructure,searchNodes,pdfLink,courseSpine,numberLabel} from './graph.mjs';
import {SVGRenderer,escapeHTML as E} from './renderer.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],app=$('#app');
const icons={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',focus:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',source:'<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',back:'<path d="m10 6-6 6 6 6M4 12h16"/>',forward:'<path d="m14 6 6 6-6 6M20 12H4"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',review:'<path d="M5 21V4h11l-2 4 2 4H5"/>',filter:'<path d="M3 6h18M6.5 12h11M10 18h4"/>',chevron:'<path d="m6 15 6-6 6 6"/>',info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',key:'<circle cx="6" cy="7" r="2.2"/><path d="M11 7h9M4 17h3m4 0h9"/><path d="m4.5 15.5 3 3m0-3-3 3"/>'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.arrow}</svg>`;
const button=(action,text,ico,extra='')=>`<button type="button" data-action="${action}" ${text&&!extra.includes('aria-label')?`aria-label="${E(text.replace(/<[^>]*>/g,''))}"`:''} ${extra}>${ico?icon(ico):''}${text?`<span>${text}</span>`:''}</button>`;
const ROLE={definition:'Definition',result:'Result',example:'Example',variant:'Editorial variant'};
const SHAPE={definition:'<circle cx="7" cy="7" r="4.6"/>',result:'<path d="M7 1.6 12.4 7 7 12.4 1.6 7Z"/>',example:'<rect x="2.7" y="2.7" width="8.6" height="8.6" rx="1.8"/>',variant:'<circle cx="7" cy="7" r="4.6" class="hollow"/>'};
const roleMark=(role,label='')=>`<svg class="role-mark role-${role}" viewBox="0 0 14 14" ${label?`role="img" aria-label="${label}"`:'aria-hidden="true"'}>${SHAPE[role]||SHAPE.definition}</svg>`;
const DASH={proof:'',definition:'',example:'1.6 3',variant:'6 3.5',context:'1 3.5 6 3.5',implication:'',teaching:'1 3'};
const lineMark=layer=>`<svg class="line-mark layer-${layer}" viewBox="0 0 30 10" aria-hidden="true"><path d="M2 5H24" ${DASH[layer]?`stroke-dasharray="${DASH[layer]}"`:''}/>${layer==='context'?'':'<path class="tip" d="M23 2.2 28 5 23 7.8Z"/>'}</svg>`;
// V1's recorded statement and relationship gt:r015 say it removes only compactness of X.
const VARIANT_FOR_ASSUMPTION={'gt:a:compact':'gt:e019'};
const FEATURED='gt:e018';
let data,layouts,notes=[],sourceText={},searchText={},live,manifest,renderer,hoverId=null,hoverRelId=null,previousFocus=null,lastSearch=0,gesture=null,raf=0,camAnim=0,view=null,sourceAvailable=true,sheetOpen=false,panelKey='',searchIds=null,listTab='entities',inertia=0,adjacency={},wheelTimer=null,toastTimer=null,resourceHover=null;
let entityMap,proofMap,occurrenceMap,relationLimit=80,currentChapter=null,sourceZoom=false,preserveCameraUntil=0;
let cameraFrame=0,cameraIdle=0,spineState=null,graphFrameRect=null;
const phys={dragId:null,vel:{},raf:0};
const store=createStore();
const entity=id=>entityMap?.get(id),proofById=id=>proofMap?.get(id),occ=id=>occurrenceMap?.get(id),region=id=>data.regions.find(r=>r.id===id);
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=()=>window.innerWidth<=720;
const layoutKey=()=>mobile()?'mobile':'desktop';
const status='<span class="review-tag">Pending teacher review</span>';
const sourceAction=(o,label)=>`<a class="source-action${sourceAvailable?'':' unavailable'}" href="${E(pdfLink(data,o))}" target="_blank" rel="noopener" ${sourceAvailable?'':'data-unavailable="true" title="The original PDF is not bundled with this build"'}>${icon('source')}${E(label||`Source p.${o.physicalPage}`)}</a>`;
const pages=o=>`p.${o.physicalPage}${o.endPage>o.physicalPage?'–'+o.endPage:''}`;
// The notes' own chapter numbers, titles and sections (data/source-text.json); the atlas regions are the fallback.
const chapter=id=>{const r=region(id),c=sourceText.chapters?.find(x=>x.regionId===id);return{number:c?.number||String(r.index),title:c?.title||r.label,start:r.start,end:r.end};};
const sectionOf=n=>{const s=sourceText.entities?.[n.id]?.section;if(!s)return `Chapter ${chapter(n.sourceChapterId).number} · ${chapter(n.sourceChapterId).title}`;const x=sourceText.sections.find(y=>y.number===s);return x?`§${x.number} ${x.title}`:`Chapter ${s} · ${chapter(n.sourceChapterId).title}`;};
// Transcription markup: _{…} subscript, ^{…} superscript, ‾{…} overline.
// Line breaks follow the printed layout; numbered lines become the printed list.
const inline=t=>E(t).replace(/_\{([^}]*)\}/g,'<sub>$1</sub>').replace(/\^\{([^}]*)\}/g,'<sup>$1</sup>').replace(/‾\{([^}]*)\}/g,'<span class="overline">$1</span>');
const printed=t=>{let html='',open=false;for(const line of t.split('\n')){const m=line.match(/^(\d+)\.\s+(.*)$/);if(m&&!open){html+='<ol>';open=true;}if(!m&&open){html+='</ol>';open=false;}html+=m?`<li value="${m[1]}">${inline(m[2])}</li>`:`<p>${inline(line)}</p>`;}return html+(open?'</ol>':'');};
const SOURCE_ROLE={statement:'In the notes',repeat:'Stated again',context:'Context in the notes'};
function sourceBlock(n){
 const e=sourceText.entities?.[n.id];
 if(!e)return n.sourceEnvironment==='editorial_variant'?'<div class="source-text editorial"><span class="eyebrow">Not in the notes</span><p>An editorial variant constructed for the atlas. The notes do not state it.</p></div>':'';
 const result=['theorem','lemma','proposition','corollary'].includes(n.sourceEnvironment);
 return e.excerpts.map(x=>`<figure class="source-text ${x.role}${result&&x.role==='statement'?' result':''}"><figcaption><span class="eyebrow">${SOURCE_ROLE[x.role]||'In the notes'}</span><b>${E(x.label)}</b>${sourceAction({physicalPage:x.page},`PDF ${x.page}${x.endPage>x.page?'–'+x.endPage:''}`)}</figcaption>${x.facsimiles?.length?`<div class="source-facsimile-frame">${facsimiles(x.facsimiles,x.label)}</div>${button('source-zoom','Enlarge source',null,'class="source-enlarge" aria-pressed="false"')}<p class="source-extraction-note">Original typesetting · printed p.${x.printedPage||x.page} · physical PDF p.${x.page}. ${sourceAction({physicalPage:x.page},'Enlarge in PDF')}</p><details><summary>Read the text transcription</summary><div class="source-transcript">${inline(x.text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,''))}</div><p class="source-extraction-note">PDF extraction can move indices or lose overbars. The original typesetting above preserves the source.</p></details>`:`<blockquote>${printed(x.text)}</blockquote>`}</figure>`).join('');
}
function facsimiles(xs,label){return xs.map((f,i)=>`<svg class="source-facsimile" viewBox="${f.x} ${f.y} ${f.width} ${f.height}" role="img" aria-label="Original typesetting: ${E(label)}, physical PDF page ${f.physicalPage}, printed page ${E(f.printedPage)}"><title>${E(label)} · original page ${f.physicalPage}</title><image href="${E(f.url)}" width="${f.pageWidth}" height="${f.pageHeight}"/></svg>`).join('');}
const entityButton=(n,extra='')=>`<button class="entity-link" data-action="select" data-id="${n.id}" data-hover="${n.id}">${roleMark(n.mathematicalRole)}<span><strong>${E(n.shortLabel)}</strong><small>${E(numberLabel(n))}${extra}</small></span></button>`;

async function init(){
 try{[data,layouts]=await Promise.all(['data/atlas.json','data/layout.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error(`Could not load ${url}`);return r.json();}));
 entityMap=new Map(data.nodes.map(n=>[n.id,n]));proofMap=new Map(data.proofs.map(p=>[p.id,p]));occurrenceMap=new Map(data.occurrences.map(o=>[o.id,o]));
 notes=(await fetch('data/review-notes.json').then(r=>r.ok?r.json():null).catch(()=>null))?.items||[];
 sourceText=await fetch('data/source-text.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
 live={desktop:structuredClone(layouts.desktop.positions),mobile:structuredClone(layouts.mobile.positions)};
 for(const n of data.nodes)adjacency[n.id]=[];
 for(const r of visibleGraph(data,store.state).relationships){adjacency[r.fromId].push(r.toId);adjacency[r.toId].push(r.fromId);}
 try{sourceAvailable=(await fetch(data.source.url.replace(/^\//,'./'),{method:'HEAD'})).ok;}catch{sourceAvailable=false;}
 app.innerHTML=shell();
 renderer=new SVGRenderer($('#graph'),{onSelect:select,onStroke:inspectRelationship,onHover:hover,onEdgeHover:hoverEdge});
 renderer.flagged=new Set(notes.filter(x=>x.level==='check').flatMap(x=>x.relatesTo));
 searchText=Object.fromEntries(Object.entries(sourceText.entities||{}).map(([id,e])=>[id,[sectionOf(entity(id)),...e.excerpts.map(x=>x.label+' '+x.text)].join(' ')]));
 app.addEventListener('click',onClick);app.addEventListener('change',onChange);app.addEventListener('pointerover',onPanelHover);app.addEventListener('pointerout',onPanelHover);
 $('#search').addEventListener('input',onSearch);$('#search').addEventListener('keydown',searchKeys);$('#search').addEventListener('focus',()=>{if($('#search').value.trim())onSearch({target:$('#search')});});document.addEventListener('keydown',onKey);
 bindCamera();
 new ResizeObserver(()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!gesture){if(performance.now()>=preserveCameraUntil){if(store.state.overlay==='proof')fit(false,false,0);else if(currentChapter)focusChapter(currentChapter,0);else if(store.state.selectedEntityId)ensureVisible(store.state.selectedEntityId);else fit(false,false,0);}render();if(store.state.overlay==='proof')drawWires();}});}).observe($('.network'));
 render();fit(false,false,0);render();
 const hash=decodeURIComponent(location.hash.slice(1));if(entity(hash))select(hash);
 if(mobile()&&!entity(hash))focusChapter('compactness',0);
 window.atlas={data,store,notes,sourceText,get manifest(){return manifest},get renderer(){return renderer},get positions(){return positions()},get camera(){return view},select,dispatch,fit,focusChapter,stats,ready:true};
 }catch(error){app.innerHTML=`<main class="load-error"><h1>The atlas could not open</h1><p>${E(error.message)}. Serve this directory over HTTP and reload.</p><a href="./source/General-Topology-lecture-notes-2025-101pages.pdf#page=81">Open the original notes</a></main>`;console.error(error);}
}
function shell(){return `<header class="appbar"><a href="./" class="brand" aria-label="General Topology Atlas, home"><span class="brand-symbol" aria-hidden="true">τ</span><span class="brand-text"><strong>General Topology Atlas</strong><small>2025 lecture notes · complete source coverage</small></span></a>
 <div class="search-wrap" role="search">${icon('search')}<label for="search" class="sr-only">Search entities, numbers or concepts</label><input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Search theorems, definitions, numbers…" aria-controls="search-results" aria-expanded="false"><kbd aria-hidden="true">/</kbd><div id="search-results" class="search-results" role="listbox" hidden></div></div>
 <nav class="header-actions" aria-label="Views">${button('list','Index','list')}${button('source','Notes','source','class="notes-button"')}${button('audit','Review','review','class="review-button"')}</nav></header>
 <main id="main" class="workspace"><section class="network" aria-label="Mathematical network"><nav class="spine" id="spine" aria-label="Chapters of the 2025 notes, with the page of each modeled entity"></nav>
 <div class="graph-frame"><svg id="graph" tabindex="0" role="group" aria-label="Interactive topology network. Tab to an entity and press Enter. Arrow keys pan, plus and minus zoom, zero fits."></svg></div>
 <div class="legend" id="legend"></div><aside id="layers-panel" class="floating-panel layers-panel" aria-label="Topics and filters" hidden></aside>
 <div class="camera-controls" aria-label="Graph camera">${button('back','','back','aria-label="Back" title="Back"')}${button('forward','','forward','aria-label="Forward" title="Forward"')}<span class="toolbar-divider"></span>${button('zoom-out','','minus','aria-label="Zoom out" title="Zoom out (−)"')}<output id="zoom-level">100%</output>${button('zoom-in','','plus','aria-label="Zoom in" title="Zoom in (+)"')}<span class="toolbar-divider"></span>${button('fit','','fit','aria-label="Fit the whole network" title="Fit the whole network (0)"')}${button('fit-selection','','focus','class="fit-selection" aria-label="Fit selection and its neighbors" title="Fit selection and its neighbors"')}</div>
 <div id="graph-location" class="graph-location" aria-live="polite" hidden></div><div id="hover-preview" class="hover-preview" hidden></div><div id="empty-graph" class="empty-graph" hidden>No entities match this isolation. <button data-action="reset">Reset view</button></div><div id="toast" class="toast" role="status" hidden></div></section>
 <aside id="panel" class="panel" aria-label="Details"></aside></main><div class="sr-only" aria-live="polite" id="announcement"></div>`;}

// ---- Geometry & camera ------------------------------------------------------
function positions(){return live[layoutKey()];}
function frameRect(){return $('.graph-frame').getBoundingClientRect();}
// The part of the network free for drawing: below the chapter titles, above the legend
// (desktop) or the bottom sheet (phones).
function viewport(){const r=frameRect(),m=mobile();let h=r.height;if(m){const w=$('.workspace').getBoundingClientRect(),sheet={peek:96,half:w.height*.46,full:w.height}[$('#panel').dataset.sheet||'peek'];h=Math.max(150,Math.min(h,w.bottom-sheet-r.top-4));}else{const l=$('#legend').getBoundingClientRect();if(l.height)h=Math.max(200,l.top-r.top-8);}return{width:r.width,height:r.height,visible:h,top:m?34:46,mobile:m};}
function fitInto(ns,v,pad,maxZoom){const c=fitCamera(ns,positions(),v.width,v.visible-v.top,pad,maxZoom,v.mobile?{x:34,top:16,bottom:30}:undefined);return{...c,y:c.y+v.top};}
function fitNodes(ids){const ns=ids?data.nodes.filter(n=>ids.includes(n.id)):manifest?.nodes||data.nodes,v=viewport();return fitInto(ns,v,v.mobile?8:24,ids?1.5:1.25);}
function fit(record=true,selection=false,duration=420){
 currentChapter=null;
 manifest=visibleGraph(data,store.state);const s=store.state;let ids=null;
 if(selection&&s.selectedEntityId)ids=[s.selectedEntityId,...neighbors(manifest,s.selectedEntityId)];
 else if(s.overlay==='proof')ids=proofFocus(data,proofById(s.activeProofId).theorem);
 else if(s.neighborhood==='proof'&&s.selectedEntityId)ids=proofFocus(data,s.selectedEntityId);
 setCamera(fitNodes(ids),{record,duration});
}
function setCamera(camera,{record=true,duration=0,moving=false}={}){
 const from=view||camera;store.dispatch({type:'camera',camera},{record});cancelAnimationFrame(camAnim);
 if(!duration||reduced()||!view){view={...camera};if(moving)requestCameraPaint();else renderGraph();return;}
 const t0=performance.now(),step=now=>{const t=Math.min(1,(now-t0)/duration),e=1-Math.pow(1-t,3);view={x:from.x+(camera.x-from.x)*e,y:from.y+(camera.y-from.y)*e,z:from.z+(camera.z-from.z)*e};if(t<1){requestCameraPaint(true);camAnim=requestAnimationFrame(step);}else{camAnim=0;renderGraph();}};
 camAnim=requestAnimationFrame(step);
}
function zoom(factor,center,record=true){const old=store.state.camera,p=center||(()=>{const v=viewport();return{x:v.width/2,y:v.visible/2};})(),z=Math.max(.015,Math.min(4,old.z*factor)),f=z/old.z;setCamera({x:p.x-(p.x-old.x)*f,y:p.y-(p.y-old.y)*f,z},{record,duration:center?0:220,moving:!!center});}
function toWorld(clientX,clientY){const r=graphFrameRect||frameRect(),c=view;return{x:(clientX-r.left-c.x)/c.z,y:(clientY-r.top-c.y)/c.z};}

// ---- Rendering ----------------------------------------------------------------
function dispatch(action,options){store.dispatch(action,options);render();}
function render(){
 manifest=visibleGraph(data,store.state);const s=store.state;
 app.classList.toggle('proof-active',s.overlay==='proof');app.classList.toggle('source-argument-active',s.overlay==='proof'&&s.activeProofId!=='gt:p001');
 renderGraph();renderPanel();renderLegend();renderLayers();renderSpine();
 $('#empty-graph').hidden=!!manifest.nodes.length;$('[data-action="back"]').disabled=!store.canBack;$('[data-action="forward"]').disabled=!store.canForward;$('[data-action="fit-selection"]').disabled=!s.selectedEntityId;
 for(const b of $$('.header-actions [data-action]'))b.setAttribute('aria-pressed',String(s.overlay===b.dataset.action));
}
function bandsFor(key){return layouts[key].bands.map(b=>{const c=chapter(b.id);return{...b,mark:c.number,label:c.title,pages:`pp. ${c.start}–${c.end}`};});}
function requestCameraPaint(inFrame=false){
 const paint=()=>{cameraFrame=0;renderer.setMotion(true);if(!renderer.renderCamera(view))renderGraph(false,true);$('#zoom-level').textContent=`${Math.round(view.z*100)}%`;};
 if(inFrame){cancelAnimationFrame(cameraFrame);paint();}
 else if(!cameraFrame)cameraFrame=requestAnimationFrame(paint);
 clearTimeout(cameraIdle);cameraIdle=setTimeout(()=>{cameraIdle=0;renderGraph();},160);
}
function renderGraph(motion=false,cameraMotion=false){
 if(motion&&renderer.renderMotion(positions(),view))return;
 renderer.setMotion(motion||cameraMotion);
 cancelAnimationFrame(cameraFrame);cameraFrame=0;clearTimeout(cameraIdle);cameraIdle=0;
 if(!manifest||!view)return;const s=store.state,v=viewport(),p=s.overlay==='proof'?proofById(s.activeProofId):null;
 const stepRes=p?.steps.find(x=>x.id===s.proofView.stepId)?.resources||[],resourceIds=resourceHover?[resourceHover]:stepRes;
 const m=p?{...manifest,focusIds:proofFocus(data,p.theorem)}:manifest;
 const f=graphFrameRect=frameRect(),obstacles=['#legend','.camera-controls'].map(q=>$(q)?.getBoundingClientRect()).filter(r=>r?.width).map(r=>({x:r.left-f.left-4,y:r.top-f.top-4,w:r.width+8,h:r.height+8}));
 renderer.render(m,positions(),{...s,camera:view},{width:v.width,height:v.height,mobile:v.mobile,hoverId,hoverRelId,resourceIds,bands:bandsFor(layoutKey()),orientation:mobile()?'vertical':'horizontal',searchIds,obstacles,expandedChapter:currentChapter,motion});
 const loc=$('#graph-location');if(loc&&loc.dataset.chapter!==String(currentChapter)){loc.dataset.chapter=String(currentChapter);loc.hidden=!currentChapter;loc.innerHTML=currentChapter?`<b>${E(chapter(currentChapter).number+' '+chapter(currentChapter).title)}</b> · zoom for labels · 0: whole course`:'';}
 $('#zoom-level').textContent=`${Math.round(view.z*100)}%`;
 updateSpineState();
}
function stats(){
 const paths=$$('#graph .edge').filter(e=>e.getAttribute('d')&&getComputedStyle(e).display!=='none'&&+getComputedStyle(e).opacity>0),chapter=id=>entity(id).sourceChapterId;
 const drawn=paths.map(e=>manifest.relationships.find(r=>r.id===e.dataset.rel)),cross=drawn.filter(r=>chapter(r.fromId)!==chapter(r.toId));
 return{nodes:$$('#graph .graph-node').length,relationships:manifest.relationships.length,drawnEdges:paths.length,crossChapterRelationships:manifest.relationships.filter(r=>chapter(r.fromId)!==chapter(r.toId)).length,drawnCrossChapter:cross.length,arrowheads:paths.filter(e=>e.getAttribute('marker-end')).length,labels:$$('#graph .node-label:not(.hidden)').length};
}

// ---- Panel --------------------------------------------------------------------
const VIEWS={overview:overviewView,entity:entityView,relationship:relationshipView,proof:proofView,list:listView,source:sourceView,audit:auditView};
function renderPanel(force=false){
 const s=store.state,el=$('#panel'),name=s.overlay||(s.selectedEntityId?'entity':'overview');
 const key=JSON.stringify([name,s.selectedEntityId,s.selectedRelationshipId,s.activeProofId,s.proofView,s.topicIds,s.relationLayers,listTab,mobile()]);
 if(!force&&key===panelKey)return;
 const same=el.dataset.view===name&&el.dataset.subject===String(s.selectedEntityId||s.activeProofId||''),top=same?el.querySelector('.panel-scroll')?.scrollTop||0:0;
 const focused=el.contains(document.activeElement)?{action:document.activeElement.dataset.action,id:document.activeElement.dataset.id}:null;
 panelKey=key;el.dataset.view=name;el.dataset.subject=String(s.selectedEntityId||s.activeProofId||'');el.classList.toggle('wide',name==='proof');
 el.setAttribute('role',mobile()&&['proof','list','source','audit'].includes(name)?'dialog':'region');
 el.innerHTML=`<button class="sheet-handle" data-action="sheet" aria-expanded="${sheetOpen}" aria-label="${sheetOpen?'Collapse':'Expand'} details"><span></span></button>${VIEWS[name]()}`;
 const scroller=el.querySelector('.panel-scroll');if(scroller)scroller.scrollTop=top;
 if(focused?.action)el.querySelector(`[data-action="${focused.action}"]${focused.id?`[data-id="${CSS.escape(focused.id)}"]`:''}`)?.focus({preventScroll:true});
 updateSheet(name);
 if(name==='proof')requestAnimationFrame(drawWires);
}
// Mobile: the panel is a bottom sheet — a peek for the overview, half height for an
// entity, full height for the proof, index, notes and review views.
function updateSheet(name=$('#panel').dataset.view){const el=$('#panel'),full=['proof','list','source','audit'].includes(name);el.dataset.sheet=full?'full':sheetOpen?'full':name==='overview'?'peek':'half';}
function panelTop(eyebrow,closeAction,closeLabel){return `<div class="panel-top"><span class="eyebrow">${eyebrow}</span>${button(closeAction,'','close',`class="icon-button" aria-label="${closeLabel}"`)}</div>`;}
function overviewView(){
 const spine=courseSpine(data),t=entity(FEATURED),drawn=visibleGraph(data,{...store.state,topicIds:[],neighborhood:null}).relationships.length;
 return `<div class="panel-scroll"><div class="panel-intro"><span class="eyebrow">Course overview</span><h1>One connected map of the notes</h1>
 <p class="lede">${data.nodes.length} entities from the 2025 lecture notes — definitions, results, examples and labeled editorial variants — joined by ${drawn} drawn relationships across all seven chapters. Explore a chapter, zoom into a neighborhood, or start with ${E(t.number)}.</p>
 <button class="primary proof-open" data-action="proof-shortcut"><span>Start with ${E(t.number)}<small>${E(t.en)}</small></span>${icon('arrow')}</button></div>
 <p class="chapter-guide">Each mark is one entity. At course scale only landmark labels appear; zoom or choose a chapter to reveal more. Every line is a recorded relationship. <button data-action="fit">Fit whole course</button></p><div class="section-label">Chapters of the notes</div><ol class="chapter-list">${spine.segments.map(g=>`<li class="${g.modeled?'modeled':'unmodeled'}">${g.modeled?`<button data-action="chapter" data-id="${g.id}">`:'<div>'}<span class="chapter-roman">${chapter(g.id).number}</span><span class="chapter-title">${E(chapter(g.id).title)}<small>pp. ${g.start}–${g.end}</small></span><span class="chapter-count">${g.modeled?`${g.modeled} modeled`:'not yet modeled'}</span>${g.modeled?'</button>':'</div>'}</li>`).join('')}</ol>
 <p class="muted small">${E(data.coverage.coverageDescription)} Chapter titles, sections and statements are shown as printed in the notes; atlas paraphrases are labeled.</p>
 <div class="section-label">Reading the map</div><ul class="reading-guide"><li><b>Left to right</b> follows the chapters of the notes; <b>top to bottom</b> follows the longest recorded chain of prerequisites.</li><li>${lineMark('proof')}<span><b>Used in a proof</b> and ${lineMark('definition')}<b>uses a definition</b> are dependencies. Arrows point from a prerequisite to what uses it.</span></li><li>${lineMark('example')}${lineMark('variant')}${lineMark('context')}<span>Examples, variants and editorial comparisons are drawn differently: they are not dependencies.</span></li></ul>
 <div class="section-label">Review status</div><p class="small">${status} Every entity and relationship awaits teacher review; formal verification has not been attempted. ${button('audit','Open review notes','arrow','class="text-button"')}</p></div>`;
}
function relationGroups(n){
 const order=['proof_uses:dependent','uses_definition:dependent','instantiates:dependent','variant_of:dependent','counterexample_to:prereq','proof_uses:prereq','uses_definition:prereq','instantiates:prereq','variant_of:prereq','counterexample_to:dependent','related_to:dependent','related_to:prereq','implies:prereq','implies:dependent','teaches_before:prereq','teaches_before:dependent'],groups={};
 for(const r of manifest.relationships){if(r.fromId!==n.id&&r.toId!==n.id)continue;const side=r.dependentId===n.id?'dependent':'prereq',key=`${r.type}:${side}`;(groups[key]||=[]).push({r,other:entity(side==='dependent'?r.prereqId:r.dependentId)});}
 return order.filter(k=>groups[k]).map(k=>{const [type,side]=k.split(':');return{type,side,title:PHRASES[type][side],items:groups[k],layer:groups[k][0].r.layer};});
}
const ORIGIN={source_passage_with_editorial_segmentation:'source passage · editorial segmentation',editorial_premise_reading:'editorial premise reading',source_expanded:'expanded from the source proof',editorial_expansion:'atlas expansion of the source proof'};
function structureHTML(n){
 const st=statementStructure(n,data);
 if(!st)return n.formula?`<p class="formula" role="math" aria-label="${E(n.mathText)}">${E(n.formula)}</p>`:'';
 if(st.kind==='equivalence')return `<div class="structure"><div class="section-label">Equivalence <small>both directions</small></div><div class="equiv"><span>${E(st.left)}</span><b aria-label="if and only if">⇔</b><span>${E(st.right)}</span></div></div>`;
 const not=st.kind==='non-implication';
 return `<div class="structure${not?' refuted':''}" aria-label="Hypotheses, all required, and conclusion"><div class="section-label">${not?'Kept hypotheses':'Hypotheses'} <small>${st.hypotheses.length>1?`all ${st.hypotheses.length} required`:'required'}</small></div><ol class="hypothesis-list">${st.hypotheses.map((h,i)=>`<li>${i?'<span class="conj" aria-label="and">∧</span>':'<span class="conj"></span>'}<span>${E(h.text)}</span></li>`).join('')}</ol><div class="conclusion"><span class="implies" aria-label="${not?'does not imply':'implies'}">${not?'⇏':'⇒'}</span><span>${E(st.conclusion)}</span></div><small class="structure-source">${st.source==='proof'?'Hypotheses as recorded in the proof’s global scope.':'Read from the recorded formula.'}</small></div>`;
}
function entityView(){
 const s=store.state,n=entity(s.selectedEntityId),proof=data.proofs.find(p=>p.theorem===n.id),o=occ(n.occurrences[0]);
 const support=proof?proofToolSupport(proof):{},variantNotes=manifest.relationships.filter(x=>(x.fromId===n.id||x.toId===n.id)&&x.layer==='variant').map(x=>({about:entity(x.fromId===n.id?x.toId:x.fromId),type:x.type,note:data.edges.find(e=>e.id===x.canonicalRelationIds[0])?.note})).filter(x=>x.note);
 const tools=proof?proofFocus(data,n.id).length-1:0;
 return `${panelTop(`${ROLE[n.mathematicalRole]} · ${E(n.number)}`,'deselect','Close details')}<div class="panel-scroll"><h1>${E(n.en)}</h1>
 <p class="meta-line"><span>${E(sectionOf(n))}</span><span>${pages(o)}</span>${status}</p>
 ${sourceBlock(n)}${n.fullEnvironmentId?`<p class="source-proof-note">This stable record models selected parts. ${entityButton(entity(n.fullEnvironmentId),' · complete printed environment')}</p>`:''}<div class="paraphrase"><span class="eyebrow">${sourceText.entities?.[n.id]?'Atlas paraphrase':'Atlas statement'}</span><p class="statement">${E(n.statement)}</p></div>${structureHTML(n)}
 ${proof?`<button class="primary proof-open" data-action="proof" data-id="${proof.id}"><span>Open proof ${E(proof.label)} · ${E(proof.title)}<small>${proof.steps.length} steps · ${tools} results and definitions used · source ${pages(occ(proof.occurrences[0]))}</small></span>${icon('arrow')}</button><button class="secondary wide" data-action="proof-tools" aria-pressed="${s.neighborhood==='proof'}">${icon('focus')}<span>${s.neighborhood==='proof'?'Show all connections':`Highlight the ${tools} entities used in this proof`}</span></button>`:''}
 ${data.proofs.filter(p=>p.theorem===n.id&&p.id!==proof?.id).map(p=>`<button class="secondary proof-open" data-action="proof" data-id="${p.id}">Open ${E(p.label)} · ${E(p.title)}</button>`).join('')}${!proof&&['result','example'].includes(n.mathematicalRole)?`<p class="source-proof-note">${E(n.sourceProofDisposition?.note||'No separately written proof is supplied for this environment. Any argument included in its source passage remains visible above.')} ${n.sourceProofDisposition?sourceAction({physicalPage:n.sourceProofDisposition.physicalPage},'Source instruction'):''}</p>`:''}
 ${variantNotes.map(x=>`<div class="variant-note"><b>${E(MEANING[x.type])} · ${E(numberLabel(x.about))}.</b> ${E(x.note)}</div>`).join('')}
 ${reviewNotes(n.id)}
 ${n.sourceEnvironment!=='editorial_variant'&&({theorem:'result',lemma:'result',proposition:'result',corollary:'result',remark:'result',unnumbered_definition:'definition',unnumbered_result:'result',problem:'example'}[n.sourceEnvironment]||n.sourceEnvironment)!==n.mathematicalRole?`<p class="small muted">Printed as ${E(n.sourceEnvironment)} in the notes; mathematically a ${E(n.mathematicalRole)}.</p>`:''}
 ${relationGroups(n).map(g=>`<div class="section-label rel-title layer-${g.layer}">${lineMark(g.layer)}${E(g.title)}${g.type==='related_to'?' <small>not a dependency</small>':''}</div><ul class="rel-list">${g.items.map(({r,other})=>{const via=g.type==='proof_uses'&&g.side==='dependent'?support[other.id]:null,cite=via?` · ${via.map(x=>`S${x.index}, ${ORIGIN[x.origin]||x.origin}`).join('; ')}`:g.type==='proof_uses'&&g.side==='prereq'?` · via ${E(proofById(r.viaProofId)?.label||'')}`:'';return `<li>${entityButton(other,cite)}${button('relationship','','info',`class="icon-button rel-info" data-id="${r.id}" aria-label="Why: ${E(r.label)} — ${E(other.shortLabel)}"`)}</li>`;}).join('')}</ul>`).join('')}
 <div class="section-label">Topics</div><div class="topic-chips">${n.topicIds.map(id=>`<button data-action="topic" data-id="${id}" aria-pressed="${s.topicIds.includes(id)}">${E(data.topics.find(t=>t.id===id).label)}</button>`).join('')}</div>
 <div class="section-label">Source</div><div class="source-links">${n.occurrences.map(id=>{const x=occ(id);return `<div class="source-row">${sourceAction(x,`${x.originalNumber} · ${pages(x)}`)}<q>${E(x.quote)}</q></div>`;}).join('')}</div>
 <details class="entity-provenance"><summary>Entity provenance</summary><dl><dt>Environment</dt><dd>${E(n.sourceEnvironment.replaceAll('_',' '))}</dd><dt>Role</dt><dd>${E(n.mathematicalRole)}</dd><dt>Origin</dt><dd>${E(n.origin.replaceAll('_',' '))}</dd><dt>ID</dt><dd><code>${n.id}</code></dd><dt>Review</dt><dd>${E(n.review.status.replaceAll('_',' '))} · revision ${n.review.revision} · formal verification ${E(n.review.formal_verification.replaceAll('_',' '))}</dd></dl>${n.type==='variant'?'<p class="small muted">Source locations support the editorial construction; they are not an original statement of V1.</p>':''}</details></div>`;
}
// Candidate issues found while checking source pages during the redesign (data/review-notes.json).
function reviewNotes(id){return notes.filter(x=>x.relatesTo.includes(id)).map(x=>`<div class="review-note"><b>For instructor review · p.${x.page} · ${E(x.title)}.</b> ${E(x.body)} ${sourceAction({physicalPage:x.page},`Source p.${x.page}`)}</div>`).join('');}
const MEANING={proof_uses:'Used in a proof',uses_definition:'Uses a definition',instantiates:'Example of a definition',counterexample_to:'Counterexample',variant_of:'Editorial variant',related_to:'Editorial comparison',teaches_before:'Suggested reading order',implies:'Logical implication'};
const ref=n=>({...n,number:n.number.replace(' (not source numbering)','')});
function relationSentence(r){const a=ref(entity(r.prereqId)),b=ref(entity(r.dependentId)),p=r.viaProofId?proofById(r.viaProofId):null;return{
 proof_uses:`Proof ${p?.label} of ${b.number} uses ${a.number}. This is a proof dependency, not logical implication.`,
 uses_definition:`${b.number} is stated using ${a.number} (${a.en}).`,instantiates:`${b.number} is an example of ${a.number} (${a.en}).`,
 counterexample_to:`${a.number} is a counterexample to ${b.number}.`,variant_of:`${b.number} is an editorial variant of ${a.number}; it is not in the notes.`,
 related_to:`${a.number} and ${b.number} are compared editorially. This is topical similarity, not a dependency.`,
 teaches_before:`Suggested reading: ${a.number} before ${b.number}. Not teacher-confirmed and not logical implication.`,implies:`${a.number} implies ${b.number}.`}[r.type];}
function relationDetail(r){
 const a=entity(r.prereqId),b=entity(r.dependentId),canonical=data.edges.filter(e=>r.canonicalRelationIds.includes(e.id)),p=r.viaProofId?proofById(r.viaProofId):null,cites=p?(proofToolSupport(p)[r.toId]||[]):[];
 return `<article class="relationship-record layer-${r.layer}"><div class="record-heading">${lineMark(r.layer)}<span class="layer-label">${E(MEANING[r.type])}</span>${status}</div>
 <div class="relation-ends">${entityButton(a)}<span class="relation-arrow" aria-hidden="true">${r.directed?'→':'↔'}</span>${entityButton(b)}</div>
 <p>${E(relationSentence(r))}</p>${cites.length?`<p class="small">Cited in ${cites.map(c=>`step S${c.index} (${E(ORIGIN[c.origin]||c.origin)})`).join(', ')}.</p>`:''}<p class="muted small">${E(canonical.find(e=>e.type!=='proves')?.note)}</p>
 <details><summary>Record provenance</summary><dl><dt>Display kind</dt><dd>${E(r.kind.replaceAll('_',' '))}</dd><dt>Display ID</dt><dd><code>${E(r.id)}</code></dd><dt>Canonical</dt><dd>${canonical.map(e=>`<code>${e.id}</code> · ${E(e.type)}`).join('<br>')}</dd>${p?`<dt>Via proof</dt><dd><code>${p.id}</code> · ${E(p.title)}</dd>`:''}<dt>Origin</dt><dd>${E(r.origin.replaceAll('_',' '))}</dd></dl><div class="source-links">${r.occurrences.map(id=>sourceAction(occ(id),`${occ(id).originalNumber} · ${pages(occ(id))}`)).join('')}</div></details></article>`;
}
function relationshipView(){const r=manifest.relationships.find(x=>x.id===store.state.selectedRelationshipId);return `${panelTop('Connection meaning','close','Close and return')}<div class="panel-scroll">${r?relationDetail(r):'<p>This connection is hidden by the current filters.</p>'}</div>`;}
function proofView(){
 const s=store.state,p=proofById(s.activeProofId),n=entity(p.theorem),v=s.proofView,lost=new Set(unsupportedSteps(p,v.removedId)),use=v.assumptionId?assumptionUse(p,v.assumptionId):{direct:[],downstream:[]};
 const hyps=p.assumptions.filter(a=>a.scope==='gt:scope:global'),locals=p.assumptions.filter(a=>a.scope!=='gt:scope:global'),label={},active=p.steps.find(x=>x.id===v.stepId);
 hyps.forEach((a,i)=>label[a.id]=`H${i+1}`);locals.forEach((a,i)=>label[a.id]=`L${i+1}`);p.steps.forEach(x=>label[x.id]=`S${x.index}`);
 const premises=new Set(active?.inputs||[]),cls=id=>[lost.has(id)&&!p.assumptions.some(a=>a.id===id)?'unsupported':'',use.direct.includes(id)?'direct-use':use.downstream.includes(id)?'downstream-use':'',v.stepId===id?'step-selected':'',premises.has(id)?'premise':'',v.assumptionId===id?'assumption-selected':'',v.removedId===id?'removed-assumption':''].filter(Boolean).join(' ');
 const assumptionRow=a=>`<div class="proof-row ${a.scope==='gt:scope:global'?'hyp':'local'} ${cls(a.id)}" data-row="${a.id}"><span class="row-index">${label[a.id]}</span><button class="proof-statement" data-action="assumption" data-id="${a.id}" aria-pressed="${v.assumptionId===a.id}"><strong>${E(a.label)}</strong></button><span class="row-just"><span class="rule-junction">${a.scope==='gt:scope:global'?'hypothesis':'local hypothesis'}</span></span></div>`;
 const stepRow=x=>{const rule=RULES[x.inferenceRule]||{symbol:'·',label:x.inferenceRule,long:''},joint=x.inputs.length>1&&rule.symbol==='∧';return `<div class="proof-row step ${cls(x.id)}" id="step-${x.index}" data-row="${x.id}"><span class="row-index">S${x.index}</span><button class="proof-statement" data-action="step" data-id="${x.id}" aria-pressed="${v.stepId===x.id}"><strong>${E(x.title)}</strong>${x.origin==='editorial_expansion'?'<em class="origin-tag" title="This step is an editorial expansion of the source proof">atlas expansion</em>':''}${lost.has(x.id)?'<em class="lost-tag">unsupported</em>':''}</button>
  <span class="row-just"><span class="${joint?'and-junction':'rule-junction'}" data-inference-id="${x.id}" data-inputs="${x.inputs.join(',')}" title="${E(rule.long)}"><b>${rule.symbol}</b>${joint?'all of':E(rule.label.toLowerCase())}</span>${x.inputs.map(id=>`<button class="premise-chip" data-action="premise" data-id="${id}" title="${E(p.steps.find(y=>y.id===id)?.title||p.assumptions.find(a=>a.id===id)?.label)}">${label[id]}</button>`).join('')}${x.resources.length?'<span class="by">by</span>':''}${x.resources.map(id=>`<button class="resource-chip role-${entity(id).mathematicalRole}" data-action="resource" data-id="${id}" data-hover-resource="${id}" title="${E(entity(id).en)}">${E(numberLabel(entity(id)))}</button>`).join('')}</span>
  ${v.detailed||v.stepId===x.id?`<p class="step-body detailed-step">${E(x.body)}</p>`:''}</div>`;};
 let rows='',scope='gt:scope:global',macro=0;
 for(const x of p.steps){
  if(x.scope!==scope&&scope!=='gt:scope:global'){rows+='</div>';scope='gt:scope:global';}
  if(x.macro!==macro){const m=p.macros.find(y=>y.index===x.macro),span=p.steps.filter(y=>y.macro===x.macro);rows+=`<div class="proof-block block-${['','one','two','three'][x.macro]||x.macro}"><span class="block-number">0${x.macro}</span><h2>${E(m.title)}</h2><small>S${span[0].index}–S${span.at(-1).index}</small></div>`;macro=x.macro;}
  if(x.scope!==scope){const sc=p.scopes.find(y=>y.id===x.scope);rows+=`<div class="scope" data-scope="${sc.id}"><div class="scope-head"><b>${sc.quantifier?'∀':'let'}</b> ${E(sc.variables[0])}</div>`;scope=x.scope;}
  rows+=stepRow(x);
  for(const a of locals)if(p.scopes.find(y=>y.id===a.scope)?.introducedAt===x.id)rows+=assumptionRow(a);
 }
 if(scope!=='gt:scope:global')rows+='</div>';
 const variant=VARIANT_FOR_ASSUMPTION[v.removedId],cex=variant?data.edges.find(e=>e.type==='counterexample_to'&&e.toId===variant):null;
 return `<div class="proof-top"><button class="back-to-graph" data-action="close">${icon('back')}<span>Back to ${E(n.number)}</span></button><span class="eyebrow">${E(p.label)} · ${E(p.title)}</span>${sourceAction(occ(p.occurrences[0]),`Source ${pages(occ(p.occurrences[0]))}`)}</div>
 <div class="panel-scroll proof-scroll"><div class="proof-heading"><div><span class="eyebrow">${E(n.number)}</span><h1>${E(n.en)}</h1></div>${status}</div>${notes.some(x=>x.relatesTo.includes(n.id))?`<details class="proof-review"><summary>Source review notes · ${notes.filter(x=>x.relatesTo.includes(n.id)).length}</summary>${reviewNotes(n.id)}</details>`:''}${p.id==='gt:p001'?sourceBlock(n):`<p class="proof-claim">${E(n.statement)}</p><details class="proof-source"><summary>Statement in the notes</summary>${sourceBlock(n)}</details><p class="proof-scope-note">${E(p.extentNote||'')} ${E(p.premisePolicy||'All argument structure is pending teacher review.')} ${p.reconstructionStatus.includes('sketch')?'The source provides a sketch; omitted details have not been supplied.':''}</p>`}<div class="proof-methods">${data.proofs.filter(q=>q.theorem===n.id&&q.id!==p.id).map(q=>button('proof',`Read ${E(q.label)} · ${E(q.title)}`,null,`data-id="${q.id}"`)).join('')}</div>
 <p class="proof-key-line"><span><b>∧</b> every listed premise is required</span><span><b>∀</b> generalize over an arbitrary set</span><span><i class="premise-chip">S2</i> premise</span><span><i class="resource-chip role-result">T6.11</i> result cited</span></p>
 <div class="derivation" id="derivation"><svg class="proof-wires" aria-hidden="true"></svg>
  <div class="hyp-block proof-assumptions" role="group" aria-label="Hypotheses: all ${hyps.length} are required together"><div class="proof-block hyp-head"><span class="block-number">H</span><h2>Hypotheses</h2><small class="all-required">${hyps.length?'all '+hyps.length+' required':'no separate hypotheses recorded'}</small></div>${hyps.map(assumptionRow).join('')}</div>
  ${rows}</div>
 <p class="proof-key">${v.assumptionId?`<b>${E(p.assumptions.find(a=>a.id===v.assumptionId).label)}</b> is used directly in ${use.direct.map(id=>label[id]).join(', ')||'no step'}${use.downstream.length?`; ${use.downstream.map(id=>label[id]).join(', ')} depend on it`:''}.`:'Select a hypothesis to trace where it is used, or a step to see its premises and the result it cites.'}</p>
 ${active?stepDetail(p,active,lost,label):''}
 <div class="proof-actions">${button('details',v.detailed?'Hide step explanations':`Show all ${p.steps.length} step explanations`,null,`class="secondary" aria-expanded="${v.detailed}"`)}</div>
 <details class="proof-source"><summary>Read the original proof · ${pages(occ(p.occurrences[0]))}</summary><blockquote>${E(p.sourceText)}</blockquote>${sourceAction(occ(p.occurrences[0]),`Open PDF ${pages(occ(p.occurrences[0]))}`)}<p class="muted small">Page-level location. Step labels S1–S${p.steps.length}, scopes and dependency numbers are an atlas reconstruction, pending teacher review. Steps tagged “atlas expansion” are not spelled out in the source text.</p></details>
 <details class="assumption-lab" ${v.removedId?'open':''}><summary>What if a hypothesis is removed?</summary><p class="small">Remove one hypothesis to see which steps lose their justification. Losing a justification is not a proof that the conclusion is false.</p><div class="lab-actions">${hyps.map(a=>`<button data-action="remove-assumption" data-id="${a.id}" aria-pressed="${v.removedId===a.id}" class="${v.removedId===a.id?'removed-assumption':''}">${v.removedId===a.id?'Restore':'Remove'} ${E(a.label)}</button>`).join('')}</div>
 ${v.removedId?`<p class="unsupported-note">Without <b>${E(p.assumptions.find(a=>a.id===v.removedId).label)}</b>: ${[...lost].filter(id=>label[id]?.startsWith('S')).map(id=>label[id]).join(', ')||'no step'} ${lost.size>2?'lose':'loses'} support${p.steps.filter(x=>!lost.has(x.id)).length?`; ${p.steps.filter(x=>!lost.has(x.id)).map(x=>`S${x.index}`).join(', ')} remain available`:''}.</p>${variant?`<p><b>${E(entity(variant).number)}</b> — ${E(entity(variant).statement)}</p><div class="lab-actions">${button('select',`Inspect ${E(numberLabel(entity(variant)))}`,null,`data-id="${variant}"`)}${cex?button('select',`Inspect ${E(numberLabel(entity(cex.fromId)))}`,null,`data-id="${cex.fromId}"`):''}</div>`:'<p class="small muted">No variant or counterexample for this removal is recorded in the atlas.</p>'}`:''}</details>
 <p class="muted small">${data.proofs.filter(q=>q.theorem===n.id).length} recorded source argument(s) for this goal. Only methods present in the notes are included. Formal proof validation has not been attempted.</p></div>`;
}
function stepDetail(p,x,lost,label){const scopes=p.scopes.filter(y=>y.id===x.scope||x.localScopeIds?.includes(y.id));return `<section class="active-step-detail"><div class="section-label">S${x.index} · active step · ${E(ORIGIN[x.origin]||x.origin.replaceAll('_',' '))}</div><h3>${E(x.title)}</h3><p>${E(x.body)}</p>${x.inputs.length?`<p class="small"><b>${RULES[x.inferenceRule]?.symbol||''} ${E(RULES[x.inferenceRule]?.label||x.inferenceRule)}:</b> ${x.inputs.map(id=>`${label[id]} ${E(p.steps.find(y=>y.id===id)?.title||p.assumptions.find(a=>a.id===id)?.label)}`).join('; ')}. ${E(RULES[x.inferenceRule]?.long||'')}</p>`:''}<p class="small muted">${scopes.map(y=>`Scope ${y.id.replace('gt:scope:','')}: ${y.variables.map(E).join('; ')}`).join('<br>')}${x.discharges.length?`<br>Discharges scope ${x.discharges.map(y=>y.replace('gt:scope:','')).join(', ')}.`:''}</p>${lost.has(x.id)?'<p class="unsupported-note">Unsupported after the removal. No claim that this conclusion is false.</p>':''}<div class="resource-links">${x.resources.map(id=>`<button data-action="select-resource" data-id="${id}">${roleMark(entity(id).mathematicalRole)}${E(entity(id).number)}</button>`).join('')}${sourceAction(occ(x.occurrences[0]),`Step source · ${pages(occ(x.occurrences[0]))}`)}</div>${x.sourceExcerpt?`<div class="source-evidence"><span class="eyebrow">Source excerpt · physical PDF p.${x.physicalPage} · printed p.${E(x.printedPage)}</span><blockquote>${E(x.sourceExcerpt)}</blockquote>${x.facsimiles?.length?`<details><summary>See original typesetting</summary>${facsimiles(x.facsimiles,'Proof source excerpt')}</details>`:''}</div>`:''}<small>Recorded tools are highlighted in the network. Editorial premise readings are not source sentences.</small></section>`;}
function drawWires(){
 const d=$('#derivation');if(!d)return;const svg=d.querySelector('.proof-wires'),box=d.getBoundingClientRect(),s=store.state,p=proofById(s.activeProofId);if(!p)return;
 const v=s.proofView,lost=new Set(unsupportedSteps(p,v.removedId)),use=v.assumptionId?assumptionUse(p,v.assumptionId):{direct:[]};
 const y=id=>{const r=d.querySelector(`[data-row="${CSS.escape(id)}"]`)?.getBoundingClientRect();return r?r.top-box.top+Math.min(r.height/2,17):null;},gx=26;let out='';
 for(const x of p.steps){const y2=y(x.id);if(y2==null||!x.inputs.length)continue;const hot=v.stepId===x.id;
  for(const id of x.inputs){const y1=y(id);if(y1==null)continue;const w=Math.min(22,5+Math.abs(y2-y1)*.06),warm=hot||(v.assumptionId===id&&use.direct.includes(x.id));out+=`<path class="wire${warm?' hot':''}${lost.has(x.id)?' lost':''}" d="M${gx},${y1.toFixed(1)} C${gx-w},${y1.toFixed(1)} ${gx-w},${y2.toFixed(1)} ${gx},${y2.toFixed(1)}"/>`;}
  out+=`<circle class="wire-node${hot?' hot':''}" cx="${gx}" cy="${y2.toFixed(1)}" r="2.6"/>`;}
 svg.setAttribute('viewBox',`0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);svg.style.height=`${box.height}px`;svg.innerHTML=out;
}
function listView(){const tab=listTab;return `${panelTop('Index · accessible companion','close','Close the index')}<div class="panel-scroll"><div class="companion-tabs" role="tablist">${button('list-tab',`Entities (${manifest.nodes.length})`,null,`data-tab="entities" role="tab" aria-selected="${tab==='entities'}" aria-pressed="${tab==='entities'}"`)}${button('list-tab',`Relationships (${manifest.relationships.length})`,null,`data-tab="relations" role="tab" aria-selected="${tab==='relations'}" aria-pressed="${tab==='relations'}"`)}</div><div class="proof-methods">${button('source','Source notes','source')}${button('audit','Coverage & review','review')}</div><p class="muted small">The same entities and drawn relationships as the network, in course order, with keyboard access.</p>
 <div id="companion-entities" ${tab==='entities'?'':'hidden'}>${data.regions.filter(r=>manifest.nodes.some(n=>n.sourceChapterId===r.id)).map(r=>`<h3 class="companion-chapter"><span>${chapter(r.id).number}</span> ${E(chapter(r.id).title)}</h3>${manifest.nodes.filter(n=>n.sourceChapterId===r.id).sort((a,b)=>occ(a.occurrences[0]).physicalPage-occ(b.occurrences[0]).physicalPage||a.id.localeCompare(b.id)).map(n=>`<button class="companion-entity" data-action="select" data-id="${n.id}" data-hover="${n.id}">${roleMark(n.mathematicalRole)}<span><strong>${E(n.en)}</strong><small>${E(n.number)} · ${E(sectionOf(n))} · ${pages(occ(n.occurrences[0]))}</small></span>${icon('arrow')}</button>`).join('')}`).join('')}</div>
 <div id="companion-relations" ${tab==='relations'?'':'hidden'}>${tab==='relations'?manifest.relationships.slice(0,relationLimit).map(relationDetail).join('')+(manifest.relationships.length>relationLimit?button('more-relations',`Show more · ${relationLimit} of ${manifest.relationships.length}`,null,'class="companion-more"'):''):''}</div></div>`;}
function sourceView(){const o=occ('gt:o018');return `${panelTop('Source notes','close','Close source notes')}<div class="panel-scroll"><p class="source-edition">${E(data.source.edition)}</p><h3>One unchanged source. All seven chapters.</h3><p>The PDF has ${data.source.pages} physical pages. This atlas accounts for all ${data.coverage.numberedEnvironments} numbered environments, ${data.coverage.unnumberedPassages} standalone unnumbered passages and ${data.coverage.containedDefinitions} definitions within other passages. There are ${data.nodes.length} graph entities and ${data.occurrences.length} source-location records. Printed and physical page numbers coincide in this edition and are recorded separately.</p>${sourceAvailable?'':'<p class="unsupported-note">The original PDF is not included in this build, so page links cannot open. Page numbers below refer to the physical pages of the file named here.</p>'}${sourceAction(o,`Open original PDF · ${pages(o)}`)}
 <div class="section-label">Source identity</div><p>${E(data.source.filename)}</p><code class="hash">${data.source.sha256}</code><p class="small muted">SHA-256 as recorded in the data. Locations are page-level; no measured bounding boxes or sentence highlighting.</p>
 <div class="section-label">Coverage and transcriptions</div><p><a href="data/course-inventory.json" target="_blank">Complete machine-readable inventory</a> · <a href="data/source-text.json" target="_blank">Source transcriptions</a></p><div class="section-label">Original pages</div><div class="source-links">${Array.from({length:101},(_,i)=>`<span>${sourceAction({physicalPage:i+1},`PDF / printed ${i+1}`)}</span>`).join('')}</div>
 <div class="section-label">References</div>${data.references.map(r=>`<p class="small">${E(r.label)}<br><span class="muted">${E(r.url)}</span></p>`).join('')}</div>`;}
function auditView(){
 const proof=data.proofs[0],support=proofToolSupport(proof),editorial=Object.entries(support).filter(([,xs])=>xs.every(x=>x.origin==='editorial_expansion')),env={theorem:'result',lemma:'result',proposition:'result',corollary:'result',remark:'result',definition:'definition',unnumbered_definition:'definition',unnumbered_result:'result',example:'example',problem:'example',editorial_variant:'variant'},mismatch=data.nodes.filter(n=>env[n.sourceEnvironment]!==n.mathematicalRole);
 return `${panelTop('Coverage & review','close','Close review notes')}<div class="panel-scroll">${status}<h3>All ${data.coverage.numberedEnvironments} numbered environments, pending review</h3><p>${data.coverage.sourceEntities} source entities, ${data.coverage.editorialVariants} editorial variant, ${data.coverage.proofs} source arguments and ${data.coverage.steps} reconstructed steps. No mathematical approval or formal proof validation is claimed.</p>
 <div class="audit-counts"><div><strong>${data.edges.length}</strong><span>Canonical records</span><small>${data.coverage.baselineRelations} baseline + ${data.coverage.proposedRelations} proposed</small></div><div><strong>${manifest.relationships.length}</strong><span>Drawn relationships</span><small>${manifest.counts.projectedRelationships} proof projections</small></div><div><strong>${data.coverage.approved}</strong><span>Teacher-approved</span><small>all pending</small></div></div>
 <div class="section-label">For instructor review</div><ul class="review-list">
 ${editorial.map(([id,xs])=>`<li><b>${E(entity(id).number)} as a proof dependency of ${E(entity(proof.theorem).number)}</b> rests only on ${xs.map(x=>`S${x.index}`).join(', ')}, an atlas expansion of the source proof (step origin “editorial expansion”). The source text does not cite it.</li>`).join('')}
 ${mismatch.map(n=>`<li><b>${E(n.number)}</b> is printed as ${E(n.sourceEnvironment)} but recorded as a ${E(n.mathematicalRole)}.</li>`).join('')}
 ${data.edges.filter(e=>e.origin==='proposed_reconstruction').map(e=>`<li><b>Proposed: ${E(entity(e.fromId).shortLabel)} → ${E(entity(e.toId).shortLabel)}</b> (<code>${e.id}</code>). ${E(e.note)}</li>`).join('')}
 ${data.audit.map(a=>`<li><b>p.${a.page} · ${E(a.title)}.</b> ${E(a.body)}</li>`).join('')}
 ${notes.map(x=>`<li><b>p.${x.page} · ${E(x.title)}</b> <span class="muted">(found while checking the source for this redesign)</span>. ${E(x.body)} ${sourceAction({physicalPage:x.page},`Source p.${x.page}`)}</li>`).join('')}
 ${sourceAvailable?'':'<li><b>Source PDF missing from this build.</b> Page links point to <code>source.pdf</code>, which is not in the repository.</li>'}</ul>
 <details><summary>Display accounting</summary><p class="small">Proof record ${E(proof.label)} is collapsed; its “proves” record is retained in each proof projection. Reading order is off by default. Every relationship is drawn as its own path; parallel meanings between the same two entities are drawn side by side.</p><p class="small">Current display: ${manifest.counts.projectedRelationships} projected relationships; ${manifest.omitted.length} omitted canonical records.</p>${manifest.omitted.map(o=>`<p class="small"><code>${o.canonicalId}</code> · ${E(o.reason)}</p>`).join('')}<a href="data/display-manifest.json" target="_blank">Open the default display manifest</a></details>
 <p class="muted small">All seven chapters are represented. Source typos and proof gaps are retained, with review candidates above. Paragraph reading order does not certify logical dependence. Every record remains pending teacher review.</p></div>`;
}

// ---- Legend, filters, course spine ----------------------------------------------
function renderLegend(){const s=store.state,el=$('#legend');el.innerHTML=`<button class="legend-toggle-mobile" data-action="legend" aria-expanded="${el.classList.contains('open')}">${icon('key')}<span>Key</span></button>
 <div class="legend-group"><span class="legend-title">Entities</span><div class="legend-row">${['definition','result','example','variant'].map(r=>`<span class="legend-item">${roleMark(r)}${ROLE[r]}</span>`).join('')}${renderer?.flagged?.size?'<span class="legend-item" title="A note for instructor review cites this entity; see Review."><i class="review-dot-sample"></i>Review note</span>':''}</div></div>
 <div class="legend-group"><span class="legend-title">Connections <small>arrow: prerequisite → what uses it</small></span><div class="legend-row">${LAYERS.filter(l=>l.id!=='teaching').map(l=>`<button class="legend-item legend-layer" data-action="layer" data-id="${l.id}" aria-pressed="${s.relationLayers.includes(l.id)}" title="${E(l.note)} Click to ${s.relationLayers.includes(l.id)?'hide':'show'}.">${lineMark(l.id)}${E(l.label)}</button>`).join('')}${button('layers',`Topics & filters${s.topicIds.length?` · ${s.topicIds.length}`:''}`,'filter',`class="topics-button" aria-expanded="${!$('#layers-panel').hidden}" aria-controls="layers-panel"`)}</div></div>`;}
function renderLayers(){const el=$('#layers-panel');$$('[aria-controls="layers-panel"]').forEach(b=>b.setAttribute('aria-expanded',String(!el.hidden)));if(el.hidden)return;const s=store.state;
 el.innerHTML=`<div class="panel-top"><h2>Topics & filters</h2>${button('layers','','close','class="icon-button" aria-label="Close topics and filters"')}</div><div class="panel-scroll"><div class="section-label">Overlapping topics</div><p class="muted small">Highlight several topics while every entity stays visible.</p><div class="topic-controls">${data.topics.map(t=>`<button data-action="topic" data-id="${t.id}" aria-pressed="${s.topicIds.includes(t.id)}">${E(t.label)}<small>${data.nodes.filter(n=>n.topicIds.includes(t.id)).length}</small></button>`).join('')}</div><label class="check-row"><input id="isolate" type="checkbox" ${s.topicMode==='isolate'?'checked':''}><span>Isolate matching entities<small>Explicitly hide the others; the selection is kept.</small></span></label>
 <div class="section-label">Connection layers</div>${LAYERS.map(l=>`<label class="check-row"><input type="checkbox" data-layer="${l.id}" ${s.relationLayers.includes(l.id)?'checked':''}><span>${lineMark(l.id)} ${E(l.label)}<small>${E(l.note)}</small></span></label>`).join('')}${button('reset','Reset all filters',null,'class="wide secondary"')}<p class="muted small">Shape and color show the mathematical role, never topic or review status.</p></div>`;}
function renderSpine(){
 const el=$('#spine');if(el.dataset.built)return updateSpineState();
 const sp=courseSpine(data),front=sp.segments[0].start-1;
 el.innerHTML=`<div class="spine-track">${front>0?`<div class="spine-seg front" style="flex:${front}" title="Front matter, pp. 1–${front}"></div>`:''}${sp.segments.map(g=>`<div class="spine-seg ${g.modeled?'modeled':'unmodeled'}" style="flex:${g.end-g.start+1}">${g.modeled?`<button class="seg-label" data-action="chapter" data-id="${g.id}" aria-label="Chapter ${chapter(g.id).number}: ${E(chapter(g.id).title)}. Physical PDF pages ${g.start} through ${g.end}. ${g.modeled} entities." title="${chapter(g.id).number} ${E(chapter(g.id).title)} · pp. ${g.start}–${g.end} · ${g.modeled} modeled">`:`<span class="seg-label" title="${chapter(g.id).number} ${E(chapter(g.id).title)} · pp. ${g.start}–${g.end} · not yet modeled">`}<b>${chapter(g.id).number}</b><span>${E(chapter(g.id).title)}</span>${g.modeled?'</button>':'</span>'}<div class="seg-ticks">${sp.ticks.filter(t=>t.page>=g.start&&t.page<=g.end).map(t=>`<button class="spine-tick role-${t.role}" data-action="select" data-id="${t.id}" data-hover="${t.id}" style="left:calc(${((t.page-g.start+.5)/(g.end-g.start+1)*100).toFixed(2)}% + ${Math.floor(t.row/3)*2.2}px);--row:${t.row%3};--tick-offset:${Math.floor(t.row/3)*2.2}px" aria-label="${E(numberLabel(entity(t.id)))}, ${E(entity(t.id).shortLabel)}, page ${t.page}"></button>`).join('')}</div></div>`).join('')}</div>`;
 el.dataset.built='1';updateSpineState();
}
function updateSpineState(){const s=store.state,active=hoverId||s.selectedEntityId;if(spineState?.manifest===manifest&&spineState.active===active&&spineState.selected===s.selectedEntityId)return;spineState={manifest,active,selected:s.selectedEntityId};const near=new Set(active?[active,...neighbors(manifest,active)]:[]);for(const t of $$('.spine-tick')){t.classList.toggle('selected',t.dataset.id===s.selectedEntityId);t.classList.toggle('near',near.has(t.dataset.id));t.classList.toggle('dim',!!active&&!near.has(t.dataset.id));}}

// ---- Interactions ----------------------------------------------------------------
function select(id){
 sourceZoom=false;app.classList.remove('source-reading');
 if(!entity(id))return;if(store.state.overlay)store.dispatch({type:'close'});
 const previous=store.state.selectedEntityId;store.dispatch({type:'select',id});if(previous!==id&&store.state.neighborhood)store.dispatch({type:'neighborhood',value:null},{record:false});
 hideSearch();sheetOpen=false;render();
 if(previous!==id)ensureVisible(id);
 try{history.replaceState(null,'',`#${id}`);}catch{}
 announce(`${entity(id).en} selected. The surrounding network stays visible.`);
}
function focusChapter(id,duration=420){currentChapter=id;const ns=data.nodes.filter(n=>n.sourceChapterId===id);setCamera(fitInto(ns,viewport(),mobile()?12:32,1.4),{duration});announce(`Chapter ${chapter(id).number}, ${chapter(id).title}: ${ns.length} entities. Zoom to reveal labels; the complete graph persists.`);}
// Keep context: move the camera only as much as needed to show the entity and its neighbors.
function ensureVisible(id){
 const P=positions(),v=viewport(),c=store.state.camera,margin=mobile()?24:60;
 let ns=neighbors(manifest,id);if(data.nodes.length>80){const local=ns.filter(x=>entity(x).sourceChapterId===entity(id).sourceChapterId).sort((a,b)=>Math.hypot(P[a].x-P[id].x,P[a].y-P[id].y)-Math.hypot(P[b].x-P[id].x,P[b].y-P[id].y));ns=local.slice(0,5);}
 const ids=[id,...ns];
 const out=ids.some(x=>{const p={x:P[x].x*c.z+c.x,y:P[x].y*c.z+c.y};return p.x<margin||p.x>v.width-margin||p.y<margin||p.y>v.visible-margin;});
 if(out||(data.nodes.length>80&&c.z<.65))setCamera(fitInto(data.nodes.filter(n=>ids.includes(n.id)),v,mobile()?10:30,Math.max(c.z,1)),{record:false,duration:420});
}
function deselect(){store.dispatch({type:'select',id:null});store.dispatch({type:'neighborhood',value:null},{record:false});sheetOpen=false;render();try{history.replaceState(null,'',location.pathname+location.search);}catch{}}
function announce(s){$('#announcement').textContent=s;}
function toast(s){const t=$('#toast');t.textContent=s;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,3200);announce(s);}
function hover(id){
 if(hoverId===id||gesture?.moved||cameraFrame||cameraIdle)return;hoverId=id;renderGraph();const t=$('#hover-preview');t.hidden=!id;
 if(!id)return;const n=entity(id),p=renderer.nodeScreens[id],net=$('.network').getBoundingClientRect(),f=frameRect();
 t.innerHTML=`${roleMark(n.mathematicalRole)}<span><b>${E(numberLabel(n))}</b> ${E(n.en)}<small>${E(ROLE[n.mathematicalRole])} · ${neighbors(manifest,id).length} connections · select for details</small></span>`;
 placePreview(t,p.x+f.left-net.left,p.y+f.top-net.top);
}
function hoverEdge(id,e){
 if(gesture?.moved||cameraFrame||cameraIdle)return;hoverRelId=id;renderGraph();const t=$('#hover-preview');t.hidden=!id;if(!id)return;
 const r=manifest.relationships.find(x=>x.id===id),net=$('.network').getBoundingClientRect();
 t.innerHTML=`${lineMark(r.layer)}<span><b>${E(MEANING[r.type])}</b>${E(relationSentence(r))}<small>Select to see why · pending teacher review</small></span>`;
 placePreview(t,e.clientX-net.left,e.clientY-net.top);
}
function placePreview(t,x,y){const net=$('.network').getBoundingClientRect(),w=t.offsetWidth||280,h=t.offsetHeight||60;t.style.left=`${Math.max(8,Math.min(net.width-w-8,x+16))}px`;t.style.top=`${Math.max(8,Math.min(net.height-h-8,y-h-14<8?y+18:y-h-14))}px`;}
// Hovering a list entry in the panel lights up that entity in the network.
function onPanelHover(e){const el=e.target.closest?.('[data-hover],[data-hover-resource]');if(!el||e.target.closest('#graph'))return;
 if(el.dataset.hoverResource){resourceHover=e.type==='pointerover'?el.dataset.hoverResource:null;renderGraph();return;}
 const id=e.type==='pointerover'?el.dataset.hover:null;if(id===hoverId)return;hoverId=id;renderGraph();}
function inspectRelationship(id){if(store.state.overlay==='proof')return;previousFocus=document.activeElement;store.dispatch({type:'relationship',id});render();}
function hideSearch(){$('#search-results').hidden=true;$('#search').setAttribute('aria-expanded','false');if(searchIds){searchIds=null;renderGraph();}}
function onSearch(e){
 const value=e.target.value;store.dispatch({type:'search',value},{coalesce:Date.now()-lastSearch<800});lastSearch=Date.now();
 const found=searchNodes(data,value,searchText),el=$('#search-results');el.hidden=!value.trim();$('#search').setAttribute('aria-expanded',String(!el.hidden));searchIds=value.trim()?found.map(n=>n.id):null;renderGraph();
 el.innerHTML=found.length?`<div class="search-count">${found.length} matching ${found.length===1?'entity':'entities'} · highlighted in the network</div>${found.map(n=>`<button role="option" data-action="search-select" data-id="${n.id}" data-hover="${n.id}">${roleMark(n.mathematicalRole)}<span><strong>${E(n.en)}</strong><small>${E(n.number)} · ${E(sectionOf(n))} · ${pages(occ(n.occurrences[0]))}</small></span></button>`).join('')}`:`<p>No matching entities. Try “compact”, “3.57” or “Hausdorff”.</p>`;
}
function searchKeys(e){const items=$$('#search-results button');if(e.key==='ArrowDown'){items[0]?.focus();e.preventDefault();}if(e.key==='Enter'){items[0]?.click();}if(e.key==='Escape'){hideSearch();e.stopPropagation();}}
function onChange(e){if(e.target.dataset.layer){dispatch({type:'layer',id:e.target.dataset.layer});$(`[data-layer="${e.target.dataset.layer}"]`)?.focus({preventScroll:true});}if(e.target.id==='isolate'){store.dispatch({type:'topicMode',value:e.target.checked?'isolate':'highlight'});render();fit(false);}}
function closeOverlay(){const proof=store.state.overlay==='proof';store.dispatch({type:'close'});render();if(proof){preserveCameraUntil=performance.now()+500;cancelAnimationFrame(camAnim);view={...store.state.camera};renderGraph();announce('Returned to the network. Camera and selection restored.');}(previousFocus?.isConnected?previousFocus:$('#graph')).focus({preventScroll:true});}
function onClick(e){
 if(!e.target.closest('.search-wrap'))hideSearch();
 const unavailable=e.target.closest('a[data-unavailable]');if(unavailable){e.preventDefault();toast(`The original PDF is not bundled with this build. Reference: ${unavailable.textContent.trim()}.`);return;}
 const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id,s=store.state;
 if(a==='select'||a==='search-select'){if(a==='search-select'){store.dispatch({type:'neighborhood',value:null});store.dispatch({type:'topicMode',value:'highlight'});$('#search').blur();}hoverId=null;select(id);return;}
 if(a==='relationship'){inspectRelationship(id);return;}
 if(a==='layers'){const panel=$('#layers-panel');panel.hidden=!panel.hidden;renderLayers();renderLegend();if(!panel.hidden)panel.querySelector('button')?.focus({preventScroll:true});return;}
 if(a==='legend'){$('#legend').classList.toggle('open');renderLegend();return;}
 if(a==='layer'){dispatch({type:'layer',id});$(`.legend [data-action="layer"][data-id="${id}"]`)?.focus({preventScroll:true});return;}
 if(a==='deselect'){deselect();$('#graph').focus({preventScroll:true});return;}
 if(a==='sheet'){sheetOpen=!sheetOpen;panelKey='';renderPanel();if(mobile())setTimeout(()=>{if(store.state.selectedEntityId)ensureVisible(store.state.selectedEntityId);},260);return;}
 if(a==='fit'){fit();return;}
 if(a==='fit-selection'){fit(true,true);return;}
 if(a==='zoom-in'||a==='zoom-out'){zoom(a==='zoom-in'?1.25:1/1.25);return;}
 if(a==='back'||a==='forward'){preserveCameraUntil=performance.now()+500;cancelAnimationFrame(camAnim);cancelAnimationFrame(inertia);if(a==='back')store.back();else store.forward();view={...store.state.camera};render();return;}
 if(a==='reset'){store.dispatch({type:'reset'});$('#search').value='';hideSearch();render();fit(false);return;}
 if(a==='topic'){store.dispatch({type:'topic',id});render();if(s.topicMode==='isolate')fit(false);$(`#layers-panel [data-action="topic"][data-id="${id}"]`)?.focus({preventScroll:true});return;}
 if(a==='chapter'){focusChapter(id);return;}
 if(a==='source-zoom'){sourceZoom=!sourceZoom;app.classList.toggle('source-reading',sourceZoom);b.setAttribute('aria-pressed',String(sourceZoom));b.querySelector('span').textContent=sourceZoom?'Fit source':'Enlarge source';return;}
 if(a==='more-relations'){relationLimit+=80;renderPanel(true);return;}
 if(a==='proof-shortcut'){select(FEATURED);return;}
 if(a==='proof-tools'){store.dispatch({type:'neighborhood',value:s.neighborhood==='proof'?null:'proof'});render();fit(false);return;}
 if(a==='proof'){previousFocus=b;if(s.overlay==='proof')store.dispatch({type:'close'},{record:false});store.dispatch({type:'proof',id});$('#layers-panel').hidden=true;sheetOpen=false;render();fit(false,false,480);$('.back-to-graph')?.focus({preventScroll:true});announce('Proof opened beside the network. The tools it uses are highlighted.');return;}
 if(a==='close'){closeOverlay();return;}
 if(['audit','source','list'].includes(a)){if(s.overlay===a){closeOverlay();return;}previousFocus=b;if(s.overlay==='proof')store.dispatch({type:'close'});store.dispatch({type:'overlay',value:a});$('#layers-panel').hidden=true;render();$('#panel .panel-top button')?.focus({preventScroll:true});return;}
 if(a==='list-tab'){listTab=b.dataset.tab;renderPanel();$(`[data-action="list-tab"][data-tab="${listTab}"]`)?.focus({preventScroll:true});return;}
 if(a==='details'){proofUpdate({detailed:!s.proofView.detailed});return;}
 if(a==='assumption'){proofUpdate({assumptionId:s.proofView.assumptionId===id?null:id,stepId:null});return;}
 if(a==='step'){proofUpdate({stepId:s.proofView.stepId===id?null:id,assumptionId:null});return;}
 if(a==='premise'){const row=$(`[data-row="${CSS.escape(id)}"] .proof-statement`);row?.focus();row?.closest('.proof-row')?.classList.add('flash');setTimeout(()=>row?.closest('.proof-row')?.classList.remove('flash'),900);return;}
 if(a==='remove-assumption'){proofUpdate({removedId:s.proofView.removedId===id?null:id});return;}
 if(a==='resource'){resourceHover=id;renderGraph();announce(`${entity(id).number}: ${entity(id).statement}`);return;}
 if(a==='select-resource'){resourceHover=null;store.dispatch({type:'close'});select(id);return;}
}
function proofUpdate(value){store.dispatch({type:'proofView',value});resourceHover=null;renderGraph();renderPanel();}
function bindCamera(){
 const svg=$('#graph'),pointers=new Map();
 svg.addEventListener('wheel',e=>{e.preventDefault();cancelAnimationFrame(inertia);const r=graphFrameRect||frameRect();zoom(Math.exp(-e.deltaY*(e.ctrlKey?.012:.0016)),{x:e.clientX-r.left,y:e.clientY-r.top},!wheelTimer);clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>wheelTimer=null,260);},{passive:false});
 svg.addEventListener('pointerdown',e=>{
  if(e.button>0)return;cancelAnimationFrame(inertia);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const node=e.target.closest('.graph-node');
  if(pointers.size===1)gesture={node:node?.dataset.node||null,id:e.pointerId,x:e.clientX,y:e.clientY,camera:{...store.state.camera},moved:false,samples:[]};
  if(pointers.size===2){const ps=[...pointers.values()];gesture={pinch:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),camera:{...store.state.camera},moved:true};store.dispatch({type:'camera',camera:store.state.camera});}
 });
 svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture.pinch){if(pointers.size<2)return;const ps=[...pointers.values()],d=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),r=graphFrameRect||frameRect(),c=gesture.camera,z=Math.max(.015,Math.min(4,c.z*d/gesture.pinch)),cx=(ps[0].x+ps[1].x)/2-r.left,cy=(ps[0].y+ps[1].y)/2-r.top,f=z/c.z;setCamera({x:cx-(cx-c.x)*f,y:cy-(cy-c.y)*f,z},{record:false,moving:true});return;}
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(!gesture.moved&&Math.hypot(dx,dy)>5){gesture.moved=true;try{svg.setPointerCapture(e.pointerId);}catch{}renderer.ignoreClickUntil=Infinity;$('#hover-preview').hidden=true;if(gesture.node){phys.dragId=gesture.node;svg.classList.add('dragging');}else store.dispatch({type:'camera',camera:store.state.camera});}
  if(!gesture.moved)return;
  if(gesture.node){const w=toWorld(e.clientX,e.clientY);positions()[gesture.node]={x:w.x,y:w.y};kick();return;}
  gesture.samples.push({t:performance.now(),x:e.clientX,y:e.clientY});if(gesture.samples.length>5)gesture.samples.shift();
  setCamera({...gesture.camera,x:gesture.camera.x+dx,y:gesture.camera.y+dy},{record:false,moving:true});
 });
 const end=e=>{
  if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size)return;
  const g=gesture;gesture=null;svg.classList.remove('dragging');
  if(g?.moved){renderer.ignoreClickUntil=performance.now()+120;if(g.node){phys.dragId=null;kick();return;}
   const ss=g.samples||[];if(ss.length>1&&!reduced()){const a=ss[0],b=ss.at(-1),dt=Math.max(16,b.t-a.t);let vx=(b.x-a.x)/dt*16,vy=(b.y-a.y)/dt*16;const glide=()=>{vx*=.9;vy*=.9;if(Math.hypot(vx,vy)<.4)return;const c=store.state.camera;setCamera({...c,x:c.x+vx,y:c.y+vy},{record:false,moving:true});inertia=requestAnimationFrame(glide);};inertia=requestAnimationFrame(glide);}}
  else renderer.ignoreClickUntil=0;
 };
 svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
}
// Elastic dragging: the dragged entity pulls its neighbors; everything springs back
// to the course layout when released, so the map's structure is never lost.
function kick(){if(!phys.raf)phys.raf=requestAnimationFrame(physicsStep);}
function physicsStep(){
 phys.raf=0;const key=layoutKey(),rest=layouts[key].positions,P=live[key];let energy=0;
 for(const n of data.nodes){const id=n.id;if(id===phys.dragId)continue;const p=P[id],v=phys.vel[id]||(phys.vel[id]={x:0,y:0});let fx=(rest[id].x-p.x)*.05,fy=(rest[id].y-p.y)*.05;
  for(const o of adjacency[id]){const q=P[o],d0=Math.hypot(rest[id].x-rest[o].x,rest[id].y-rest[o].y),dx=q.x-p.x,dy=q.y-p.y,d=Math.max(1,Math.hypot(dx,dy)),k=(d-d0)*.018;fx+=dx/d*k;fy+=dy/d*k;}
  v.x=(v.x+fx)*.8;v.y=(v.y+fy)*.8;p.x+=v.x;p.y+=v.y;energy+=Math.abs(v.x)+Math.abs(v.y);}
 renderGraph(true);
 if(phys.dragId||energy>.08)kick();else{for(const id in P)P[id]={...rest[id]};phys.vel={};renderGraph();}
}
function onKey(e){
 const typing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
 if(e.key==='Escape'){if(!$('#search-results').hidden){hideSearch();}else if(!$('#layers-panel').hidden){$('#layers-panel').hidden=true;renderLegend();$('.topics-button')?.focus();}else if(store.state.overlay)closeOverlay();else if(store.state.selectedEntityId){deselect();$('#graph').focus();}return;}
 if(e.key==='/'&&!typing){e.preventDefault();$('#search').focus();return;}
 if(typing)return;
 if(e.target===$('#graph')||e.target.closest?.('.graph-node')){if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(1/1.25);else{const c=store.state.camera,dx=e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0,dy=e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0;setCamera({...c,x:c.x+dx,y:c.y+dy});}}}
 // Keep keyboard focus inside a full-screen mobile dialog.
 if(e.key==='Tab'&&mobile()&&$('#panel').getAttribute('role')==='dialog'){const items=[...$('#panel').querySelectorAll('button,a,input,summary')].filter(x=>!x.disabled&&x.getClientRects().length);if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}
}
init();
