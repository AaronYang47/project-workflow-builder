import {
  type ReleaseConditionImportResult,
  type ReleaseConditionImportRow,
} from "@/lib/release-condition-import";
import type { ApprovalRole, ProjectOperations } from "@/types/project-operations";
import type {
  DomainEdge,
  Condition,
  DomainNode,
  ExecutionItem,
  ExecutionItemType,
  HighLevelEdge,
  HighLevelNode,
  HighLevelNodeLayout,
  HighLevelNodeType,
  NodeLayout,
  ValidationIssue,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";
import type { StoreApi } from "zustand";

export type ConfirmClearNotice = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

export type AuthUser = { id: string; email: string; name: string };

export interface WorkflowState {
  file: WorkflowFile;
  workspaceOwnerId: string;
  authUser?: AuthUser | null;
  setAuthUser: (user: AuthUser | null) => void;
  activeProjectId?: string;
  dirty: boolean;
  lastSavedAt?: string;
  hydrated: boolean;
  past: WorkflowFile[];
  future: WorkflowFile[];
  selection: { nodeIds: string[]; edgeId?: string };
  highLevelSelection: { nodeIds: string[]; edgeId?: string };
  leftOpen: boolean;
  rightOpen: boolean;
  focusedInspectorField?: string;
  validationOpen: boolean;
  issues: ValidationIssue[];
  search: string;
  confirmClear?: ConfirmClearNotice;
  deleteBlocked?: {
    title: string;
    message: string;
    items: string[];
  };
  setHydrated: () => void;
  commit: (updater: (file: WorkflowFile) => WorkflowFile) => void;
  commitTransient: (updater: (file: WorkflowFile) => WorkflowFile) => void;
  recordSnapshot: (snapshot: WorkflowFile) => void;
  replaceFile: (file: WorkflowFile) => void;
  applyCollaborativeFile: (file: WorkflowFile) => void;
  loadProject: (file: WorkflowFile, projectId: string, userId: string) => void;
  resetWorkspace: (userId?: string) => void;
  clearDetailedNodes: () => void;
  clearHighLevelNodes: () => void;
  clearExecutionItems: (nodeId?: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  selectNodes: (ids: string[]) => void;
  selectEdge: (id?: string) => void;
  selectHighLevelNodes: (ids: string[]) => void;
  selectHighLevelEdge: (id?: string) => void;
  setFocusedInspectorField: (key?: string) => void;
  addNode: (
    type: WorkflowNodeType,
    position: { x: number; y: number },
    parentId?: string,
  ) => string;
  addPhaseWrappingNodes: (
    phaseProps: {
      x: number;
      y: number;
      width: number;
      height: number;
      title: string;
      color: string;
    },
    childIds: string[],
  ) => string;
  addGateUnderNode: (gateProps: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    title?: string;
    color?: string;
    stage?: string;
  }) => string;
  toggleNodeInPhase: (phaseId: string, nodeId: string) => void;
  fitPhaseToChildren: (phaseId: string) => void;
  updateNode: (id: string, patch: Partial<DomainNode>) => void;
  deleteNodeCondition: (nodeId: string, conditionId?: string, conditionIndex?: number) => void;
  addReleaseConditionLines: (input: string) => number;
  ensureReleaseConditionIds: () => void;
  importReleaseConditions: (rows: ReleaseConditionImportRow[]) => ReleaseConditionImportResult;
  setReleaseConditionInbox: (conditions: Condition[]) => void;
  moveNodeCondition: (
    sourceNodeId: string,
    sourceIndex: number,
    targetNodeId: string,
    targetIndex: number,
  ) => void;
  deleteNodes: (ids: string[]) => void;
  deleteSelected: () => void;
  showActionBlocked: (notice: NonNullable<WorkflowState["deleteBlocked"]>) => void;
  dismissDeleteBlocked: () => void;
  showConfirmClear: (notice: ConfirmClearNotice) => void;
  dismissConfirmClear: () => void;
  addEdge: (edge: DomainEdge) => void;
  updateEdge: (id: string, patch: Partial<DomainEdge>) => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  updateLayout: (
    id: string,
    patch: Partial<WorkflowFile["layout"]["nodes"][string]>,
    record?: boolean,
  ) => void;
  updateLayouts: (patches: Record<string, Partial<NodeLayout>>) => void;
  recordLayoutHistory: (before: Record<string, NodeLayout>) => void;
  commitLayoutDrag: (
    patches: Record<string, Partial<NodeLayout>>,
    before: Record<string, NodeLayout>,
  ) => void;
  setViewport: (viewport: WorkflowFile["layout"]["viewport"]) => void;
  setHighLevelViewport: (
    viewport: NonNullable<WorkflowFile["highLevel"]>["layout"]["viewport"],
  ) => void;
  addHighLevelNode: (type: HighLevelNodeType, position: { x: number; y: number }) => string;
  updateHighLevelNode: (id: string, patch: Partial<HighLevelNode>) => void;
  reorderHighLevelLinkedNodes: (
    highLevelNodeId: string,
    draggedNodeId: string,
    targetNodeId: string,
  ) => void;
  reorderHighLevelLinkedGate: (
    highLevelNodeId: string,
    gateId: string,
    targetNodeId: string,
    position: "before" | "after",
  ) => void;
  setHighLevelGateMember: (
    highLevelNodeId: string,
    gateId: string,
    nodeId: string,
    included: boolean,
  ) => void;
  deleteHighLevelNodes: (ids: string[]) => void;
  addHighLevelEdge: (edge: HighLevelEdge) => void;
  deleteHighLevelEdge: (id: string) => void;
  commitHighLevelLayoutDrag: (
    patches: Record<string, Partial<HighLevelNodeLayout>>,
    before: Record<string, HighLevelNodeLayout>,
  ) => void;
  autoArrangeHighLevel: () => void;
  validateHighLevel: () => void;
  addExecutionItem: (linkedLayer2NodeId: string, type?: ExecutionItemType) => string;
  updateExecutionItem: (id: string, patch: Partial<ExecutionItem>) => void;
  deleteExecutionItem: (id: string) => void;
  updateOperations: (
    updater: (operations: ProjectOperations) => ProjectOperations,
    audit?: {
      actor?: string;
      actorRole?: ApprovalRole | "System";
      action: string;
      entityType?: string;
      entityId?: string;
      summary: string;
    },
  ) => void;
  classifyOperationsClient: (actor: string) => void;
  releasePaymentGate: (actor: string, role: ApprovalRole) => string | undefined;
  approveOperationsRequest: (
    requestId: string,
    actor: string,
    role: ApprovalRole,
    approve: boolean,
  ) => string | undefined;
  convertClientRecord: (input: {
    sequence: number;
    actor: string;
    gateDecisionId: string;
    buildingCount?: number;
    modulesPerBuilding?: number;
  }) => string;
  recalculateClassD: (actor: string, sourceRevision: string) => number;
  startWarranty: (input: {
    dayZeroDate: string;
    durationMonths: number;
    owner: string;
    triggerEvidence: string;
    actor: string;
  }) => string | undefined;
  validate: () => void;
  togglePanel: (panel: "left" | "right" | "validation") => void;
  setSearch: (value: string) => void;
}

export type StoreSet = StoreApi<WorkflowState>["setState"];
export type StoreGet = () => WorkflowState;
