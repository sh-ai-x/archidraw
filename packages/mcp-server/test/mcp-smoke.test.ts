import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {describe, expect, it} from "vitest";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const serverEntry=resolve(dirname(fileURLToPath(import.meta.url)),"../dist/index.js");
const element={id:"rect-1",type:"rectangle",x:10,y:20,width:100,height:60,angle:0,strokeColor:"#000",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:1,opacity:100,groupIds:null,frameId:null,index:null,roundness:null,seed:1,versionNonce:1,isDeleted:false,boundElements:null,updated:1,link:null,locked:false} as const;

describe("archidraw MCP stdio 서버",()=>{
  it("9개 툴을 노출하고 각각 한 번 호출한다",async()=>{
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry],stderr:"pipe"});
    const client=new Client({name:"smoke-client",version:"0.1.0"});
    await client.connect(transport);
    const listed=await client.listTools();
    expect(listed.tools.map(tool=>tool.name).sort()).toEqual(["align_elements","clear_scene","create_element","delete_element","export_scene","get_scene","group_elements","query_elements","update_element"].sort());
    expect((await client.callTool({name:"create_element",arguments:element})).isError).not.toBe(true);
    expect((await client.callTool({name:"update_element",arguments:{id:"rect-1",patch:{x:30}}})).isError).not.toBe(true);
    expect((await client.callTool({name:"query_elements",arguments:{filter:{ids:["rect-1"]}}})).isError).not.toBe(true);
    expect((await client.callTool({name:"group_elements",arguments:{ids:["rect-1"],groupId:"g-1"}})).isError).not.toBe(true);
    expect((await client.callTool({name:"align_elements",arguments:{ids:["rect-1"],alignment:"left"}})).isError).not.toBe(true);
    expect((await client.callTool({name:"get_scene",arguments:{}})).isError).not.toBe(true);
    expect((await client.callTool({name:"export_scene",arguments:{format:"json"}})).isError).not.toBe(true);
    expect((await client.callTool({name:"delete_element",arguments:{id:"rect-1"}})).isError).not.toBe(true);
    expect((await client.callTool({name:"clear_scene",arguments:{confirm:true}})).isError).not.toBe(true);
    await client.close();
  },20000);

  it("잘못된 입력을 거부한다",async()=>{
    const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry]});
    const client=new Client({name:"invalid-client",version:"0.1.0"});
    await client.connect(transport);
    const result=await client.callTool({name:"clear_scene",arguments:{confirm:false}});
    expect(result.isError).toBe(true);
    await client.close();
  },20000);
});
