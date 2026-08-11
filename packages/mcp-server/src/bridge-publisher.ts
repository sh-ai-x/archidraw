import type {ExcalidrawScene} from "@archidraw/schema";
import type {JsonPatchOperation} from "@archidraw/store";

export interface BridgePublisher { publish(patches: JsonPatchOperation[], scene: ExcalidrawScene): void | Promise<void> }
export class NullBridgePublisher implements BridgePublisher { publish(): void {} }
