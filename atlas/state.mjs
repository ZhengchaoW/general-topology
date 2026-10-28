import {DEFAULT_LAYERS} from './graph.mjs';
export const initialState=()=>({selectedEntityId:null,selectedRelationshipId:null,activeProofId:null,query:'',relationLayers:[...DEFAULT_LAYERS],topicIds:[],topicMode:'highlight',neighborhood:null,camera:{x:0,y:0,z:1},layoutVersion:'atlas-v3',overlay:null,proofView:{detailed:false,stepId:null,assumptionId:null,removedId:null},proofSnapshot:null});
export function transition(state,a){const n=structuredClone(state);switch(a.type){
 case 'select':n.selectedEntityId=a.id;n.overlay=null;n.selectedRelationshipId=null;break;
 case 'relationship':n.selectedRelationshipId=a.id;n.overlay='relationship';break;
 case 'camera':n.camera=a.camera;break;
 case 'search':n.query=a.value;break;
 case 'topic':n.topicIds=n.topicIds.includes(a.id)?n.topicIds.filter(x=>x!==a.id):[...n.topicIds,a.id];break;
 case 'topicMode':n.topicMode=a.value;break;
 case 'layer':n.relationLayers=n.relationLayers.includes(a.id)?n.relationLayers.filter(x=>x!==a.id):[...n.relationLayers,a.id];break;
 case 'layers':n.relationLayers=[...a.ids];break;
 case 'neighborhood':n.neighborhood=a.value;break;
 case 'overlay':n.overlay=a.value;break;
 case 'proof':n.proofSnapshot={camera:structuredClone(n.camera),selectedEntityId:n.selectedEntityId,topicIds:[...n.topicIds],topicMode:n.topicMode,relationLayers:[...n.relationLayers],neighborhood:n.neighborhood};n.activeProofId=a.id;n.overlay='proof';n.proofView={detailed:false,stepId:null,assumptionId:null,removedId:null};break;
 case 'close':if(n.overlay==='proof'&&n.proofSnapshot){Object.assign(n,n.proofSnapshot);n.proofSnapshot=null;n.activeProofId=null;}n.overlay=null;n.selectedRelationshipId=null;break;
 case 'proofView':Object.assign(n.proofView,a.value);break;
 case 'reset':Object.assign(n,initialState(),{camera:n.camera});break;
 }return n;}
export function createStore(){let state=initialState(),past=[],future=[];return{get state(){return state},get canBack(){return past.length>0},get canForward(){return future.length>0},dispatch(a,{record=true,coalesce=false}={}){if(record){if(!coalesce)past.push(structuredClone(state));future=[];}state=transition(state,a);return state;},back(){if(past.length){future.push(structuredClone(state));state=past.pop();}return state;},forward(){if(future.length){past.push(structuredClone(state));state=future.pop();}return state;}};}
