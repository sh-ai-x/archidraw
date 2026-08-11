import {describe,expect,it} from "vitest";
import {MemorySceneStore} from "../src/index.js";
import {element} from "./fixtures.js";
describe("MemorySceneStore",()=>{it("creates, updates, deletes and queries elements",()=>{const store=new MemorySceneStore();store.createElement(element());store.updateElement("one",{x:20,width:200});expect(store.getScene().elements[0]).toMatchObject({x:20,width:200});expect(store.queryElements({type:"rectangle"})).toHaveLength(1);store.deleteElement("one");expect(store.getScene().elements).toHaveLength(0)})});
