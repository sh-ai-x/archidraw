import {useEffect,useMemo,useState} from "react";
import {Canvas} from "./Canvas";
import {Toolbar} from "./Toolbar";
import {HelpModal} from "./HelpModal";
import {createMemoryStore,type Tool} from "./scene";
import "./styles.css";
export function App(){const [,refresh]=useState(0);const store=useMemo(()=>createMemoryStore(undefined,()=>refresh(v=>v+1)),[]);const [tool,setTool]=useState<Tool>("select");const [showHelp,setShowHelp]=useState(false);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==="?"||(e.shiftKey&&e.key==="/")){e.preventDefault();setShowHelp(v=>!v)}};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[]);
  return <main className="app"><Toolbar active={tool} onChange={setTool}/><section className="canvas-shell"><Canvas store={store} tool={tool} setTool={setTool}/><div className="zoom-label">{Math.round(100)}%</div></section><button className="help-fab" onClick={()=>setShowHelp(true)} title="Keyboard shortcuts (?)" aria-label="Help">?</button>{showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}</main>}
