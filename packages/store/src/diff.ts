export type JsonPatchOperation={op:"add"|"remove"|"replace";path:string;value?:unknown};
const esc=(part:string)=>part.replace(/~/g,"~0").replace(/\//g,"~1");
const join=(path:string,key:string)=>`${path}/${esc(key)}`;
export function diffJson(before:unknown,after:unknown,path=""):JsonPatchOperation[]{
  if(Object.is(before,after)) return [];
  if(Array.isArray(before)&&Array.isArray(after)){
    const out:JsonPatchOperation[]=[]; const common=Math.min(before.length,after.length);
    for(let i=0;i<common;i++) out.push(...diffJson(before[i],after[i],join(path,String(i))));
    for(let i=before.length-1;i>=after.length;i--) out.push({op:"remove",path:join(path,String(i))});
    for(let i=common;i<after.length;i++) out.push({op:"add",path:join(path,"-"),value:after[i]});
    return out;
  }
  if(isObject(before)&&isObject(after)){
    const out:JsonPatchOperation[]=[]; const keys=new Set([...Object.keys(before),...Object.keys(after)]);
    for(const key of keys){const hasBefore=Object.prototype.hasOwnProperty.call(before,key);const hasAfter=Object.prototype.hasOwnProperty.call(after,key);const p=join(path,key);if(!hasAfter)out.push({op:"remove",path:p});else if(!hasBefore)out.push({op:"add",path:p,value:after[key]});else out.push(...diffJson(before[key],after[key],p));}
    return out;
  }
  return [{op:path?"replace":"replace",path:path||"",value:after}];
}
function isObject(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
export const deepDiff=diffJson;
