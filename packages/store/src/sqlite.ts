<<<<<<< HEAD
import{createRequire}from"node:module";import type{Element,ExcalidrawScene}from"@archidraw/schema";import{MemorySceneStore,type QueryFilter,type ElementPatch}from"./memory.js";const require=createRequire(import.meta.url);
export interface SqliteSceneStoreOptions{sceneId?:string;name?:string}
export class SqliteSceneStore extends MemorySceneStore{private db:any;private sceneId:string;constructor(path:string,options:SqliteSceneStoreOptions={}){super();this.sceneId=options.sceneId??"default";let Database:any;try{Database=require("better-sqlite3")}catch{throw new Error("SqliteSceneStore requires optional dependency better-sqlite3")}this.db=new Database(path);this.db.pragma("journal_mode = WAL");this.db.exec("CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS elements (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, data JSON NOT NULL, updated_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS elements_scene_id ON elements(scene_id);");this.db.prepare("INSERT OR IGNORE INTO scenes (id,name,created_at) VALUES (?,?,?)").run(this.sceneId,options.name??this.sceneId,Date.now());for(const row of this.db.prepare("SELECT data FROM elements WHERE scene_id=? ORDER BY rowid").all(this.sceneId)as{data:string}[])this.restore(JSON.parse(row.data)as Element)}private restore(e:Element){super.createElement(e)}private persist(e:Element){this.db.prepare("INSERT INTO elements(id,scene_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").run(e.id,this.sceneId,JSON.stringify(e),Date.now())}createElement(i:Element|{element:Element}){const e=super.createElement(i);this.persist(e);return e}updateElement(id:string,p:ElementPatch|{updates:ElementPatch}){const e=super.updateElement(id,p);this.persist(e);return e}deleteElement(id:string){super.deleteElement(id);this.db.prepare("DELETE FROM elements WHERE id=? AND scene_id=?").run(id,this.sceneId)}clearScene(){super.clearScene();this.db.prepare("DELETE FROM elements WHERE scene_id=?").run(this.sceneId)}close(){this.db.close()}override getScene():ExcalidrawScene{return super.getScene()}override queryElements(f?:QueryFilter):Element[]{return super.queryElements(f)}}
=======
import {createRequire} from "node:module";
import type {Element,ExcalidrawScene} from "@archidraw/schema";
import {MemorySceneStore,type QueryFilter, type ElementPatch} from "./memory.js";
const require=createRequire(import.meta.url);
export interface SqliteSceneStoreOptions {sceneId?:string;name?:string}
export class SqliteSceneStore extends MemorySceneStore{
  private db:any; private sceneId:string;
  constructor(path:string,options:SqliteSceneStoreOptions={}){
    super(); this.sceneId=options.sceneId??"default";
    let Database:any;try{Database=require("better-sqlite3")}catch(error){throw new Error("SqliteSceneStore requires optional dependency better-sqlite3")}
    this.db=new Database(path);this.db.pragma("journal_mode = WAL");
    this.db.exec("CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS elements (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, data JSON NOT NULL, updated_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS elements_scene_id ON elements(scene_id);");
    this.db.prepare("INSERT OR IGNORE INTO scenes (id,name,created_at) VALUES (?,?,?)").run(this.sceneId,options.name??this.sceneId,Date.now());
    const rows=this.db.prepare("SELECT data FROM elements WHERE scene_id=? ORDER BY rowid").all(this.sceneId) as {data:string}[];for(const row of rows)this.restore(JSON.parse(row.data) as Element);
  }
  private restore(element:Element){super.createElement(element)}
  private persist(element:Element){this.db.prepare("INSERT INTO elements(id,scene_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").run(element.id,this.sceneId,JSON.stringify(element),Date.now())}
  createElement(input:Element|{element:Element}):Element{const element=super.createElement(input);this.persist(element);return element}
  updateElement(id:string,patch:ElementPatch|{updates:ElementPatch}):Element{const element=super.updateElement(id,patch);this.persist(element);return element}
  deleteElement(id:string):void{super.deleteElement(id);this.db.prepare("DELETE FROM elements WHERE id=? AND scene_id=?").run(id,this.sceneId)}
  clearScene():void{super.clearScene();this.db.prepare("DELETE FROM elements WHERE scene_id=?").run(this.sceneId)}
  close():void{this.db.close()}
  override getScene():ExcalidrawScene{return super.getScene()}
  override queryElements(filter?:QueryFilter):Element[]{return super.queryElements(filter)}
}
>>>>>>> origin/main
