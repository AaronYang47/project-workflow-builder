import type {
  DomainEdge,
  DomainNode,
  NodeLayout,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";

export interface CollaboratorProfile {
  peerId: string;
  name: string;
  color: string;
  avatar: string;
  focusedNodeId?: string;
  lastActiveAt: number;
}

export type SyncMessage =
  | {
      type: "SYNC_FULL_STATE";
      senderId: string;
      file: WorkflowFile;
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
    };
