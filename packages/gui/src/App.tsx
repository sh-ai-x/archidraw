import {useEffect,useMemo,useState} from "react";
import {Canvas} from "./Canvas";
import {Toolbar} from "./Toolbar";
import {HelpModal} from "./HelpModal";
import {createMemoryStore,type Tool} from "./scene";
import {subscribeToSceneDeltas} from "./bridge-client";
import type {Element} from "@archidraw/schema";
import "./styles.css";

export function App(){
  const [,refresh]=useState(0);
  const store=useMemo(()=>createMemoryStore(undefined,()=>refresh(v=>v+1)),[]);
  const [tool,setTool]=useState<Tool>("select");
  const [showHelp,setShowHelp]=useState(false);

  // ? key + Shift+/ toggles help modal
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="?"||(e.shiftKey&&e.key==="/")){
        e.preventDefault();
        setShowHelp(v=>!v);
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  // Bridge subscription: apply scene-delta events to the local store.
  // Connects to http://127.0.0.1:5174/events (SSE) and applies
  // JsonPatch operations (add / replace / remove) to the in-memory
  // scene store. Auto-reconnects on error.
  useEffect(()=>{
    const unsub=subscribeToSceneDeltas((delta:unknown)=>{
      try{
        // Bridge sends either an array of patches directly, or
        // an object with a `patches` field. Normalize.
        type Patch={op:string;path:string;value?:unknown};
        const patches:Patch[]=Array.isArray(delta)
          ?(delta as Patch[])
          :(delta as {patches?:Patch[]}).patches??[];
        if(!patches.length)return;
        for(const p of patches){
          if(p.op==="add"&&p.path==="/elements/-"&&p.value){
            store.createElement(p.value as Element);
          } else if(p.op==="replace"&&p.path==="/elements"&&Array.isArray(p.value)){
            for(const el of store.queryElements())store.deleteElement(el.id);
            for(const v of p.value as Element[]){
              if(v&&!v.isDeleted)store.createElement(v);
            }
          } else if(p.op==="remove"&&p.path.startsWith("/elements/")){
            const idx=parseInt(p.path.split("/").pop()??"-1",10);
            const el=store.queryElements({includeDeleted:true})[idx];
            if(el)store.deleteElement(el.id);
          }
        }
      } catch(e){
        console.error("[App] delta error",e);
      }
    });
    return()=>unsub();
  },[store]);

  return <main className="app">
    <Toolbar active={tool} onChange={setTool}/>
    <section className="canvas-shell">
      <Canvas store={store} tool={tool} setTool={setTool}/>
      <div className="zoom-label">{Math.round(100)}%</div>
    </section>
    <button className="help-fab" onClick={()=>setShowHelp(true)} title="Keyboard shortcuts (?)" aria-label="Help">?</button>
    {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
  </main>;
}
