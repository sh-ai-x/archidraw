import {useEffect,useMemo,useRef,useState} from "react";
import {Canvas} from "./Canvas";
import {Toolbar} from "./Toolbar";
import {HelpModal} from "./HelpModal";
import {createMemoryStore,type Tool} from "./scene";
import {subscribeToSceneDeltas} from "./bridge-client";
import {SceneTabs, type SceneTabsHandle} from "./SceneTabs";
import {SceneIO} from "./SceneIO";
import {LayoutPanel} from "./LayoutPanel";
import {SnapshotPanel} from "./SnapshotPanel";
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
    void import("./LayoutPanel")
      .then(({silentAutoFix})=>{
        const fixed=silentAutoFix(els);
        if(fixed===els)return;
        for(const e of store.queryElements({includeDeleted:true}))store.deleteElement(e.id);
        for(const v of fixed)store.createElement(v);
      })
      // A10-1 (2026-08-19): surface dynamic-import failure rather than
      // leaving a stale store when the chunk is missing or threw.
      .catch((err)=>{console.error("[App] silentAutoFix bootstrap failed", err);});
  },[store]);
  const [tool,setTool]=useState<Tool>("select");
  const [showHelp,setShowHelp]=useState(false);
  // Forwarded handle to SceneTabs so handleLoadAsTab can route through
  // its own state instead of bypassing it via localStorage. PR #48.
  const tabsRef = useRef<SceneTabsHandle | null>(null);

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

  // Called by SceneTabs when the active tab changes: rewrite store to match.
  const handleTabActiveChange = (active: { tabs: Array<{id:string;name:string;scene:{elements:Element[]}}>; activeTabId: string | null }) => {
    const activeTab = active.tabs.find(t => t.id === active.activeTabId);
    if (!activeTab) return;
    const next = activeTab.scene.elements.filter(e => !e.isDeleted);
    const current = store.queryElements({includeDeleted:true});
    // Skip if already in sync (cheap id+position+size compare).
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
  };

  // Called by SceneIO when loading a file as a new tab.
  // PR #48 review (2026-08-20, 🔴 critical #2): the previous version
  // wrote `archidraw:tabs` and `archidraw:activeTab` to localStorage
  // directly, but SceneTabs has its own debounced persist that
  // overwrote the new tab on the next tick — the loaded tab never
  // appeared. Route through SceneTabs's forwarded createTab handle so
  // the new tab lives in the same React state the rest of the UI
  // reads from.
  const handleLoadAsTab = (name: string, elements: Element[]) => {
    // Mirror the new scene into the store so the canvas shows it
    // immediately. SceneTabs's auto-save effect (driven by
    // sceneVersion) will then persist the active tab on the next
    // mutation tick.
    for (const el of store.queryElements({includeDeleted:true})) store.deleteElement(el.id);
    for (const el of elements) {
      if (el && !el.isDeleted) store.createElement(structuredClone(el));
    }
    tabsRef.current?.createTab(name, elements);
  };

  return <main className="app">
    <Toolbar active={tool} onChange={setTool}/>
    <div className="canvas-area">
      <SceneTabs
        ref={tabsRef}
        store={store}
        sceneVersion={sceneVersion}
        onActiveChange={handleTabActiveChange}
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
