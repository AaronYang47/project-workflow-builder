import { useRef, useState } from "react";
import {
  applyNodeJobNumberToFile,
  legacyJobNumberFromProjectId,
  projectNodeUuid,
} from "@/lib/project-id";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

/**
 * Manages the live editing draft, parsing, validation, and serialization
 * for Project ID and legacy job numbers on ProjectStart nodes.
 */
export function useProjectIdDraft({
  node,
  projectStartNode,
  commitTransient,
}: {
  node: DomainNode;
  projectStartNode: DomainNode | undefined;
  commitTransient: (updater: (file: WorkflowFile) => WorkflowFile) => void;
}) {
  const isProjectStart = node.type === "projectStart";
  const projectStartProjectId = String(projectStartNode?.customFields.projectId || "");

  const nodeUuid = projectNodeUuid(node, projectStartNode);
  const rawProjectId = String(node.customFields.projectId || "");
  const initialProjectId = isProjectStart
    ? legacyJobNumberFromProjectId(rawProjectId) ||
      rawProjectId.replace(/\D/g, "").slice(0, 5) ||
      String(node.customFields.legacyJobNumber || node.customFields.projectNumber || "")
        .replace(/\D/g, "")
        .slice(0, 5)
    : "";

  const [projectIdDraft, setProjectIdDraft] = useState(initialProjectId);
  const [syncedProjectId, setSyncedProjectId] = useState(initialProjectId);

  if (initialProjectId !== syncedProjectId) {
    setSyncedProjectId(initialProjectId);
    setProjectIdDraft(initialProjectId);
  }

  const projectIdSnapshotRef = useRef<WorkflowFile | null>(null);
  const projectIdValid = isProjectStart
    ? /^\d{5}$/.test(projectIdDraft)
    : Boolean(projectStartProjectId);

  const projectIdError = isProjectStart && projectIdDraft.trim().length > 0 && !projectIdValid;

  const legacyJobNumber = isProjectStart
    ? projectIdDraft
    : legacyJobNumberFromProjectId(projectStartProjectId);

  const writeCustomFields = (patch: Record<string, string | number | boolean>) => {
    commitTransient((file) => applyNodeJobNumberToFile(file, node.id, patch));
  };

  return {
    isProjectStart,
    projectStartProjectId,
    nodeUuid,
    projectIdDraft,
    setProjectIdDraft,
    projectIdSnapshotRef,
    projectIdValid,
    projectIdError,
    legacyJobNumber,
    writeCustomFields,
  };
}
