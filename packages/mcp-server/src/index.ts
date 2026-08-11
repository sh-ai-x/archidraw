#!/usr/bin/env node
import {runServer} from "./server.js";
const args=process.argv.slice(2);const dbIndex=args.indexOf("--db");const dbPath=dbIndex>=0?args[dbIndex+1]:undefined;if(dbIndex>=0&&!dbPath){console.error("--db requires a path");process.exitCode=2}else await runServer(dbPath);
export * from "./server.js";
export * from "./bridge-publisher.js";
