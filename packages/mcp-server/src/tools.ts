import {z} from "zod";
import {ExcalidrawElementSchema, type Element} from "@archidraw/schema";
import type {SceneStore} from "@archidraw/store";

export const CreateInput = ExcalidrawElementSchema;
export const UpdateInput = z.object({id:z.string().min(1),patch:z.record(z.unknown())});
export const DeleteInput = z.object({id:z.string().min(1)});
export const QueryInput = z.object({filter:z.object({type:z.string().optional(),ids:z.array(z.string()).optional(),bounds:z.object({x:z.number(),y:z.number(),width:z.number(),height:z.number()}).optional()}).optional()});
export const GroupInput = z.object({ids:z.array(z.string()).min(1),groupId:z.string().min(1)});
export const AlignInput = z.object({ids:z.array(z.string()).min(1),alignment:z.enum(["left","center","right","top","middle","bottom"])});
export const ClearInput = z.object({confirm:z.literal(true)});
export const ExportInput = z.object({format:z.enum(["json","svg","png"])});

export function registerTools(server:any, store:SceneStore): void {
  server.registerTool("create_element", {description:"Create an Excalidraw element", inputSchema:CreateInput}, async (input:any) => {const created=store.createElement(input);return {content:[{type:"text",text:JSON.stringify({id:created.id})}],structuredContent:{id:created.id}}});
  server.registerTool("update_element", {description:"Update an element", inputSchema:UpdateInput}, async ({id,patch}:z.infer<typeof UpdateInput>) => {const updated=store.updateElement(id,patch);return {content:[{type:"text",text:JSON.stringify({id,updated})}],structuredContent:{id,updated}}});
  server.registerTool("delete_element", {description:"Delete an element", inputSchema:DeleteInput}, async ({id}:z.infer<typeof DeleteInput>) => {store.deleteElement(id);return {content:[{type:"text",text:JSON.stringify({id})}],structuredContent:{id}}});
  server.registerTool("query_elements", {description:"Query scene elements", inputSchema:QueryInput}, async ({filter}:z.infer<typeof QueryInput>) => {const elements=store.queryElements(filter);return {content:[{type:"text",text:JSON.stringify({elements})}],structuredContent:{elements}}});
  server.registerTool("group_elements", {description:"Assign elements to a group", inputSchema:GroupInput}, async ({ids,groupId}:z.infer<typeof GroupInput>) => {for(const element of store.queryElements({ids}))store.updateElement(element.id,{groupIds:[...(element.groupIds??[]),groupId]});return {content:[{type:"text",text:JSON.stringify({groupId})}],structuredContent:{groupId}}});
  server.registerTool("align_elements", {description:"Align elements", inputSchema:AlignInput}, async ({ids,alignment}:z.infer<typeof AlignInput>) => {const elements=store.queryElements({ids});if(!elements.length)return {content:[{type:"text",text:JSON.stringify({aligned:0})}],structuredContent:{aligned:0}};const left=Math.min(...elements.map(e=>e.x)),right=Math.max(...elements.map(e=>e.x+e.width)),top=Math.min(...elements.map(e=>e.y)),bottom=Math.max(...elements.map(e=>e.y+e.height)),center=(left+right)/2,middle=(top+bottom)/2;for(const e of elements){const patch:{x?:number;y?:number}={};if(alignment==="left")patch.x=left;if(alignment==="center")patch.x=center-e.width/2;if(alignment==="right")patch.x=right-e.width;if(alignment==="top")patch.y=top;if(alignment==="middle")patch.y=middle-e.height/2;if(alignment==="bottom")patch.y=bottom-e.height;store.updateElement(e.id,patch)}return {content:[{type:"text",text:JSON.stringify({aligned:elements.length})}],structuredContent:{aligned:elements.length}}});
  server.registerTool("get_scene", {description:"Get the current scene", inputSchema:{}}, async () => {const scene=store.getScene();return {content:[{type:"text",text:JSON.stringify(scene)}],structuredContent:scene}});
  server.registerTool("clear_scene", {description:"Clear the scene", inputSchema:ClearInput}, async () => {const cleared=store.queryElements({includeDeleted:true}).length;store.clearScene();return {content:[{type:"text",text:JSON.stringify({cleared})}],structuredContent:{cleared}}});
  server.registerTool("export_scene", {description:"Export the current scene", inputSchema:ExportInput}, async ({format}:z.infer<typeof ExportInput>) => {const scene=store.getScene();const data=format==="json"?JSON.stringify(scene):format==="svg"?sceneToSvg(scene):emptyPng;return {content:[{type:"text",text:JSON.stringify({format,data})}],structuredContent:{format,data}}});
}

const emptyPng="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function sceneToSvg(scene:{elements:Element[]}):string {const shapes=scene.elements.filter(e=>!e.isDeleted).map(e=>`<rect x="${e.x}" y="${e.y}" width="${Math.max(0,e.width)}" height="${Math.max(0,e.height)}" />`).join("");return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800">${shapes}</svg>`}
