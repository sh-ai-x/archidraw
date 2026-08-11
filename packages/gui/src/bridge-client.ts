export type SceneDeltaListener=(delta:unknown)=>void;
export function subscribeToSceneDeltas(_listener:SceneDeltaListener):()=>void{return ()=>{}};
