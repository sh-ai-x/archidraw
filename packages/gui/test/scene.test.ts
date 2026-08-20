// @vitest-environment jsdom
import {afterEach,describe,expect,it} from "vitest";
import {containerTextFor,createMemoryStore,emptyScene,loadScene,makeElement,pointInElement} from "../src/scene";
import type {Element} from "@archidraw/schema";

afterEach(()=>localStorage.clear());

describe("GUI scene store",()=>{
  it("updates an element after a selection drag and persists it",()=>{
    const store=createMemoryStore(emptyScene()); const element=makeElement("rectangle",10,20,100,80,7); store.createElement(element);
    const update=store.updateElement; let called=false; store.updateElement=(id,patch)=>{called=true;update.call(store,id,patch)};
    store.updateElement(element.id,{x:35,y:45});
    expect(called).toBe(true); expect(store.queryElements()[0]).toMatchObject({x:35,y:45}); expect(loadScene().elements[0]).toMatchObject({x:35,y:45});
  });
  it("deletes the selected element",()=>{const store=createMemoryStore(emptyScene());const element=makeElement("rectangle",0,0,40,40);store.createElement(element);store.deleteElement(element.id);expect(store.queryElements()).toHaveLength(0)});
  it("hit-tests bounding boxes and arrow endpoints",()=>{const rect=makeElement("rectangle",10,10,40,30);const arrow=makeElement("arrow",100,100,80,0);expect(pointInElement(rect,25,25)).toBe(true);expect(pointInElement(arrow,180,100)).toBe(true);expect(pointInElement(rect,200,200)).toBe(false)});
});

describe("containerTextFor",()=>{
  it("returns a bbox centered inside the container with sensible defaults",()=>{
    const rect=makeElement("rectangle",100,200,300,120,1);
    const t=containerTextFor(rect);
    expect(t.x).toBeGreaterThanOrEqual(rect.x);
    expect(t.y).toBeGreaterThanOrEqual(rect.y);
    expect(t.x+t.width).toBeLessThanOrEqual(rect.x+rect.width);
    expect(t.y+t.height).toBeLessThanOrEqual(rect.y+rect.height);
  });
  it("respects an explicit text height for multi-line content",()=>{
    const rect=makeElement("rectangle",0,0,200,100,1);
    const t=containerTextFor(rect,{height:60});
    expect(t.height).toBe(60);
  });
});

describe("makeElement text branch",()=>{
  it("honors the optional containerId argument when supplied",()=>{
    const containerId="shape-1";
    const t=makeElement("text",10,10,200,28,1,{containerId});
    expect((t as any).containerId).toBe(containerId);
  });
  it("defaults containerId to null when omitted",()=>{
    const t=makeElement("text",10,10,200,28,1);
    expect((t as any).containerId).toBeNull();
  });
});

describe("createContainerTextPair",()=>{
  it("inserts both elements and links text.containerId to the container id",()=>{
    const store=createMemoryStore(emptyScene());
    const rect=makeElement("rectangle",100,100,200,100,1);
    const text=makeElement("text",0,0,80,28,2,{containerId:rect.id});
    store.createContainerTextPair(rect,text);
    const els=store.queryElements();
    expect(els).toHaveLength(2);
    const storedText=els.find(e=>e.type==="text")!;
    expect((storedText as any).containerId).toBe(rect.id);
  });
  it("appends the text id to the container's boundElements array with type=text",()=>{
    const store=createMemoryStore(emptyScene());
    const rect=makeElement("rectangle",100,100,200,100,1);
    const text=makeElement("text",0,0,80,28,2,{containerId:rect.id});
    store.createContainerTextPair(rect,text);
    const storedRect=store.queryElements().find(e=>e.id===rect.id)!;
    expect(storedRect.boundElements).not.toBeNull();
    expect(storedRect.boundElements).toEqual([{id:text.id,type:"text"}]);
  });
  it("inserts the text element BEFORE the container so the container outline draws on top",()=>{
    const store=createMemoryStore(emptyScene());
    const rect=makeElement("rectangle",100,100,200,100,1);
    const text=makeElement("text",0,0,80,28,2,{containerId:rect.id});
    store.createContainerTextPair(rect,text);
    const els=store.getScene().elements;
    const textIdx=els.findIndex(e=>e.id===text.id);
    const rectIdx=els.findIndex(e=>e.id===rect.id);
    expect(textIdx).toBeLessThan(rectIdx);
  });
  it("is a single undo step — one undo reverses both insertions",()=>{
    const store=createMemoryStore(emptyScene());
    const beforeCount=store.getScene().elements.length;
    const rect=makeElement("rectangle",100,100,200,100,1);
    const text=makeElement("text",0,0,80,28,2,{containerId:rect.id});
    store.createContainerTextPair(rect,text);
    expect(store.getScene().elements.length).toBe(beforeCount+2);
    expect(store.undo()).toBe(true);
    expect(store.getScene().elements.length).toBe(beforeCount);
  });
  it("persists the bound pair through localStorage save/load",()=>{
    const store=createMemoryStore(emptyScene());
    const rect=makeElement("rectangle",50,50,200,100,1);
    const text=makeElement("text",0,0,80,28,2,{containerId:rect.id});
    store.createContainerTextPair(rect,text);
    const reloaded=loadScene();
    expect(reloaded.elements).toHaveLength(2);
    const reloadedText=reloaded.elements.find(e=>e.type==="text")!;
    expect((reloadedText as any).containerId).toBe(rect.id);
  });
});