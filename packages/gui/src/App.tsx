import {useMemo,useState} from "react";
import {Canvas} from "./Canvas";
import {Toolbar} from "./Toolbar";
import {createMemoryStore,type Tool} from "./scene";
import "./styles.css";
export function App(){const [,refresh]=useState(0);const store=useMemo(()=>createMemoryStore(undefined,()=>refresh(v=>v+1)),[]);const [tool,setTool]=useState<Tool>("select");return <main className="app"><Toolbar active={tool} onChange={setTool}/><section className="canvas-shell"><Canvas store={store} tool={tool} setTool={setTool}/><div className="zoom-label">{Math.round(100)}%</div></section></main>}
