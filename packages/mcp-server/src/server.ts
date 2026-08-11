import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {MemorySceneStore, SqliteSceneStore, type SceneStore} from "@archidraw/store";
import {registerTools} from "./tools.js";
import type {BridgePublisher} from "./bridge-publisher.js";

export function createServer(store:SceneStore = new MemorySceneStore(), bridgePublisher?:BridgePublisher):McpServer {const server=new McpServer({name:"archidraw",version:"0.1.0"});if(bridgePublisher)store.subscribe((patches,scene)=>{void bridgePublisher.publish(patches,scene)});registerTools(server,store);return server}
export function createStore(dbPath?:string):SceneStore{return dbPath?new SqliteSceneStore(dbPath):new MemorySceneStore()}
export async function runServer(dbPath?:string):Promise<void>{const server=createServer(createStore(dbPath));await server.connect(new StdioServerTransport())}
