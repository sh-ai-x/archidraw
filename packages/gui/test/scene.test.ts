// @vitest-environment jsdom
import {afterEach,describe,expect,it} from "vitest";
import {createMemoryStore,emptyScene,loadScene,makeElement,pointInElement} from "../src/scene";
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
