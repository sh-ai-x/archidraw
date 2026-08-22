import {useEffect,useMemo,useRef,useState} from "react";
import {Canvas} from "./Canvas";
import {Toolbar} from "./Toolbar";
import {HelpModal} from "./HelpModal";
import {createMemoryStore,type Tool} from "./scene";
import {subscribeToSceneDeltas} from "./bridge-client";
import {SceneTabs} from "./SceneTabs";
import {tabsStore, useTabsStore} from "./tabs-state";
import {SceneIO} from "./SceneIO";
import {LayoutPanel} from "./LayoutPanel";
import {SnapshotPanel} from "./SnapshotPanel";
import {silentAutoFix} from "./layout";
import type {Element} from "@archidraw/schema";
import "./styles.css";

export function App(){
  const [sceneVersion,setSceneVersion]=useState(0);
  const store=useMemo(()=>createMemoryStore(undefined,()=>setSceneVersion(v=>v+1)),[]);
  // Run the layout auto-fix once on mount (mutates store directly, no publish → no loop)
  const seededRef=useRef(false);
  useEffect(()=>{
    if(seededRef.current)return;
    seededRef.current=true;
    const els=store.getScene().elements;
    if(!els.length)return;
    try {
      const fixed = silentAutoFix(els);
      if (fixed === els) return;
      for (const e of store.queryElements({includeDeleted:true})) store.deleteElement(e.id);
      for (const v of fixed) store.createElement(v);
    } catch (err) {
      console.error("[App] silentAutoFix bootstrap failed", err);
    }
  },[store]);
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
  useEffect(()=>{
    const unsub=subscribeToSceneDeltas((delta:unknown)=>{
      try{
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

  // 🟠 major #3 follow-up (2026-08-20): subscribe to the activeTabId
  // here instead of receiving it via the onActiveChange callback prop.
  // App now owns the active-tab → store sync; SceneTabs is purely
  // presentational (it only dispatches user actions back to
  // tabsStore). Drops one of the three synchronizers the reviewer
  // flagged.
  const activeTabId = useTabsStore(s => s.activeTabId);
  useEffect(() => {
    if (!activeTabId) return;
    const state = tabsStore.getState();
    const activeTab = state.tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    const next = activeTab.scene.elements.filter((e: Element) => !e.isDeleted);
    const current = store.queryElements({includeDeleted:true});
    if (current.length === next.length) {
      let same = true;
      for (let i = 0; i < current.length; i++) {
        const a = current[i], b = next[i];
        if (a.id !== b.id || a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) {
          same = false; break;
        }
      }
      if (same) return;
    }
    for (const el of store.queryElements({includeDeleted:true})) store.deleteElement(el.id);
    for (const el of next) store.createElement(structuredClone(el));
  }, [activeTabId, store]);

  const handleLoadAsTab = (name: string, elements: Element[]) => {
    tabsStore.createTab(name, elements);
    for (const el of store.queryElements({includeDeleted:true})) store.deleteElement(el.id);
    for (const el of elements) {
      if (el && !el.isDeleted) store.createElement(structuredClone(el));
    }
  };

  return <main className="app">
    <Toolbar active={tool} onChange={setTool}/>
    <div className="canvas-area">
      <SceneTabs
        store={store}
        sceneVersion={sceneVersion}
        rightSlot={<><SceneIO store={store} onLoadAsTab={handleLoadAsTab}/><LayoutPanel store={store}/><SnapshotPanel/></>}
      />
      <section className="canvas-shell">
        <Canvas store={store} tool={tool} setTool={setTool}/>
        <div className="zoom-label">{Math.round(100)}%</div>
      </section>
    </div>
    {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
  </main>;
}
