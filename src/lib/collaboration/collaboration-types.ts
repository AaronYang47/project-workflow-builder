import type {
  Condition,
  DomainEdge,
  DomainNode,
  NodeLayout,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";

export interface CollaboratorProfile {
  peerId: string;
  userId?: string;
  name: string;
  color: string;
  avatar: string;
  joinedAt: number;
  focusedNodeId?: string;
  cursor?: { x: number; y: number; space?: "canvas" | "surface"; view?: CollaborativeViewState };
  cursorAt?: number;
  lastActiveAt: number;
}

export interface CollaborativeViewState {
  page?: "workflow" | "conditions" | "process-overview";
  layer: "L1" | "L2" | "L3" | "L4";
  executionNodeId?: string;
}

export interface ReleaseConditionDragPreview {
  source: { nodeId: string; index: number; label: string };
  target?: { nodeId: string; index: number; x: number; y: number };
  x: number;
  y: number;
  view: CollaborativeViewState;
}

export type SyncMessage =
  | { type: "RC_DRAG_PREVIEW"; senderId: string; preview: ReleaseConditionDragPreview | null; timestamp: number }
  | {
      type: "PATCH_RELEASE_CONDITION_INBOX";
      senderId: string;
      conditions: Condition[];
      timestamp: number;
    }
  | {
      type: "SYNC_FULL_STATE";
      senderId: string;
      file: WorkflowFile;
      view?: CollaborativeViewState;
      timestamp: number;
    }
  | {
      type: "REQUEST_FULL_STATE";
      senderId: string;
    }
  | {
      type: "PATCH_NODE";
      senderId: string;
      nodeId: string;
      patch: Partial<DomainNode>;
      timestamp: number;
    }
  | {
      type: "ADD_NODE";
      senderId: string;
      nodeType: WorkflowNodeType;
      position: { x: number; y: number };
      parentId?: string;
      nodeId: string;
      domainNode: DomainNode;
      layout: NodeLayout;
      timestamp: number;
    }
  | {
      type: "DELETE_NODES";
      senderId: string;
      nodeIds: string[];
      timestamp: number;
    }
  | {
      type: "ADD_EDGE";
      senderId: string;
      edge: DomainEdge;
      timestamp: number;
    }
  | {
      type: "UPDATE_EDGE";
      senderId: string;
      edgeId: string;
      patch: Partial<DomainEdge>;
      timestamp: number;
    }
  | {
      type: "UPDATE_LAYOUTS";
      senderId: string;
      patches: Record<string, Partial<NodeLayout>>;
      timestamp: number;
    }
  | {
      type: "PRESENCE";
      senderId: string;
      profile: CollaboratorProfile;
      editorPeerId?: string | null;
      controlRevision?: number;
      view?: CollaborativeViewState;
    }
  | {
      type: "EDITOR_CONTROL";
      senderId: string;
      editorPeerId: string;
      reason: "initial" | "transfer" | "recovery";
      controlRevision?: number;
      timestamp: number;
    }
  | {
      type: "REQUEST_EDITOR_CONTROL";
      senderId: string;
      editorPeerId: string;
      timestamp: number;
    }
  | {
      type: "DECLINE_EDITOR_CONTROL";
      senderId: string;
      targetPeerId: string;
      timestamp: number;
    }
  | {
      type: "CURSOR";
      senderId: string;
      x: number;
      y: number;
      space?: "canvas" | "surface";
      view?: CollaborativeViewState;
      timestamp: number;
    }
  | {
      type: "VIEW_STATE";
      senderId: string;
      view: CollaborativeViewState;
      timestamp: number;
    };
