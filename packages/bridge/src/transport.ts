/** A single RFC 6902 JSON Patch operation. */
export interface JsonPatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

/** The element-only delta exchanged by the bridge. */
export type SceneDelta = JsonPatchOperation[];
export type DeltaListener = (delta: SceneDelta) => void;
export type Unsubscribe = () => void;

export interface BridgeTransport {
  publish(delta: SceneDelta): void | Promise<void>;
  subscribe(onDelta: DeltaListener): Unsubscribe;
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
}

export function isSceneDelta(value: unknown): value is SceneDelta {
  return Array.isArray(value) && value.every((operation) => {
    if (!operation || typeof operation !== "object") return false;
    const candidate = operation as Record<string, unknown>;
    return (candidate.op === "add" || candidate.op === "remove" || candidate.op === "replace")
      && typeof candidate.path === "string";
  });
}
