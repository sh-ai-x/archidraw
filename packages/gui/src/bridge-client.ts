export type SceneDeltaListener = (delta: unknown) => void;
export type SceneListener = (scene: unknown) => void;

const SSE_URL = "http://127.0.0.1:5174/events";
const POLL_URL = "http://127.0.0.1:5174/scene";

let es: EventSource | null = null;
const deltaListeners = new Set<SceneDeltaListener>();
const sceneListeners = new Set<SceneListener>();
let currentScene: unknown = null;

function notifyDeltas(delta: unknown) {
  for (const l of deltaListeners) l(delta);
}

function notifyScene(scene: unknown) {
  currentScene = scene;
  for (const l of sceneListeners) l(scene);
}

function connect() {
  if (es) return;
  try {
    es = new EventSource(SSE_URL);
    es.addEventListener("scene-delta", (ev) => {
      try {
        const delta = JSON.parse((ev as MessageEvent).data);
        notifyDeltas(delta);
      } catch (e) { console.error("[bridge-client] parse error", e); }
    });
    es.addEventListener("scene", (ev) => {
      try {
        const scene = JSON.parse((ev as MessageEvent).data);
        notifyScene(scene);
      } catch (e) { console.error("[bridge-client] scene parse error", e); }
    });
    es.onerror = () => {
      // Auto-reconnect after 2s
      es?.close();
      es = null;
      setTimeout(connect, 2000);
    };
  } catch (e) {
    console.error("[bridge-client] connect failed", e);
    setTimeout(connect, 2000);
  }
}

export function subscribeToSceneDeltas(listener: SceneDeltaListener): () => void {
  deltaListeners.add(listener);
  connect();
  return () => { deltaListeners.delete(listener); };
}

export function subscribeToScene(listener: SceneListener): () => void {
  sceneListeners.add(listener);
  // Replay last scene if any
  if (currentScene) listener(currentScene);
  connect();
  return () => { sceneListeners.delete(listener); };
}

export function publishDelta(delta: unknown): Promise<Response> {
  return fetch(SSE_URL.replace("/events", "/publish"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(delta),
  });
}

export function getCurrentScene(): unknown { return currentScene; }
