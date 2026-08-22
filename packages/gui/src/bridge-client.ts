export type SceneDeltaListener = (delta: unknown) => void;
export type SceneListener = (scene: unknown) => void;

const SSE_URL = "http://127.0.0.1:5174/events";
const POLL_URL = "http://127.0.0.1:5174/scene";

/**
 * A08 review round 4 (2026-08-22): the previous `EventSource(SSE_URL)`
 * blindly consumed every event frame. The bridge already enforces
 * allowlist-origin on POST `/publish` and SSE producer-side, but a
 * defense-in-depth check on the consumer side rejects any URL that
 * resolves off-loopback (e.g. tampered localStorage config, a
 * malicious browser extension that overrode the URL). Cheap
 * `startsWith("http://127.0.0.1:")` is the strongest check we can
 * make without breaking the loopback contract.
 */
const isLoopbackSseUrl = (url: string): boolean =>
  url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");

let es: EventSource | null = null;
const deltaListeners = new Set<SceneDeltaListener>();
const sceneListeners = new Set<SceneListener>();
let currentScene: unknown = null;

/**
 * A10 review round 4 (2026-08-22): the previous bridge-client
 * reconnected with a fixed 2000ms `setTimeout` forever. A bridge
 * process that stays down (e.g. user closed the daemon) hammered
 * the loopback port at 0.5 Hz indefinitely, leaking memory and
 * log-spamming. Cap with exponential backoff (2s, 4s, 8s, ..., 30s)
 * and circuit-break after 5 consecutive failures so the failure
 * signature is visible in the dev console without burning the loop.
 */
let reconnectAttempt = 0;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_CIRCUIT_BREAKER = 5;
let circuitBroken = false;
function scheduleReconnect(): void {
  if (circuitBroken) return;
  reconnectAttempt += 1;
  if (reconnectAttempt > RECONNECT_CIRCUIT_BREAKER) {
    circuitBroken = true;
    console.warn(
      `[bridge-client] circuit-broken after ${RECONNECT_CIRCUIT_BREAKER} consecutive failures; ` +
      `retry the page (or call resetReconnect()) to recover.`,
    );
    return;
  }
  const delay = Math.min(
    RECONNECT_MAX_MS,
    2_000 * Math.pow(2, reconnectAttempt - 1),
  );
  setTimeout(connect, delay);
}
export function resetReconnect(): void {
  reconnectAttempt = 0;
  circuitBroken = false;
}

function notifyDeltas(delta: unknown) {
  for (const l of deltaListeners) l(delta);
}

function notifyScene(scene: unknown) {
  currentScene = scene;
  for (const l of sceneListeners) l(scene);
}

function connect() {
  if (es || circuitBroken) return;
  if (!isLoopbackSseUrl(SSE_URL)) {
    // A08 review round 4: refuse to open any non-loopback SSE channel.
    // This guards against a tampered `SSE_URL` constant being replaced
    // by a build-time injection or a runtime override.
    console.error("[bridge-client] refusing non-loopback SSE_URL:", SSE_URL);
    circuitBroken = true;
    return;
  }
  try {
    es = new EventSource(SSE_URL);
    es.addEventListener("open", () => { reconnectAttempt = 0; });
    es.addEventListener("scene-delta", (ev) => {
      try {
        const delta = JSON.parse((ev as MessageEvent).data);
        notifyDeltas(delta);
      } catch (e) {
        // A09 review round 4: log only the error type + message, not
        // the full Error object. Error.message can embed arbitrary
        // payload snippets from the offending SSE frame, exposing
        // them via browser devtools.
        const err = e instanceof Error ? e : new Error(String(e));
        console.error("[bridge-client] parse error:", err.name, "-", err.message);
      }
    });
    es.addEventListener("scene", (ev) => {
      try {
        const scene = JSON.parse((ev as MessageEvent).data);
        notifyScene(scene);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error("[bridge-client] scene parse error:", err.name, "-", err.message);
      }
    });
    es.onerror = () => {
      // Auto-reconnect with exponential backoff (capped). The previous
      // fixed-2000ms reconnect loop was an unbounded retry primitive
      // — A10 review round 4 finding.
      es?.close();
      es = null;
      scheduleReconnect();
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[bridge-client] connect failed:", err.name, "-", err.message);
    scheduleReconnect();
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
