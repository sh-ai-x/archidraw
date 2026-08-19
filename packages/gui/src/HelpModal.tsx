import type {JSX} from "react";
const SECTIONS:Array<{title:string;rows:Array<[string,string]>}>=[
  {title:"Tools",rows:[
    ["H","Hand (pan only)"],
    ["V","Select"],
    ["R","Rectangle"],
    ["D","Diamond"],
    ["O","Ellipse"],
    ["A","Arrow"],
    ["L","Line"],
    ["T","Text"],
  ]},
  {title:"Edit",rows:[
    ["Delete / Backspace","Delete selected (multi-aware)"],
    ["Esc","Deselect → switch to Select tool"],
    ["Double-click text","Edit text content"],
  ]},
  {title:"Multi-select",rows:[
    ["Drag empty space","Marquee select"],
    ["Click empty space","Clear selection"],
    ["Ctrl/Cmd + A","Select all"],
    ["Ctrl/Cmd + D","Duplicate selected"],
  ]},
  {title:"Scene",rows:[
    ["Ctrl/Cmd + S","Save scene as JSON"],
    ["Ctrl/Cmd + O","Open scene from JSON"],
    ["Drag corner handle","Resize selected element"],
  ]},
  {title:"History",rows:[
    ["Ctrl/Cmd + Z","Undo"],
    ["Ctrl/Cmd + Shift + Z / Ctrl+Y","Redo"],
  ]},
  {title:"View",rows:[
    ["Hold Space + drag","Pan (in any tool)"],
    ["Mouse wheel","Zoom in/out"],
    ["?", "Show this dialog"],
  ]},
];
export function HelpModal({onClose}:{onClose:()=>void}):JSX.Element{
  return <div className="help-modal-backdrop" onClick={onClose}>
    <div className="help-modal" onClick={e=>e.stopPropagation()}>
      <div className="help-modal-head">
        <h2>Keyboard shortcuts</h2>
        <button className="help-modal-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="help-modal-body">
        {SECTIONS.map(s=><section key={s.title}>
          <h3>{s.title}</h3>
          <table>
            <tbody>{s.rows.map(([k,v])=><tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody>
          </table>
        </section>)}
      </div>
    </div>
  </div>;
}
