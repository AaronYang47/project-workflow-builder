import { useRef, useState } from "react";
import {
  legacyJobNumberFromProjectId,
  projectNodeUuid,
  syncProjectNameIdentity,
} from "@/lib/project-id";
import type { DomainNode } from "@/types/workflow";

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
  commitTransient: (
    updater: (
      file: import("@/types/workflow").WorkflowFile,
    ) => import("@/types/workflow").WorkflowFile,
  ) => void;
}) {
  const isProjectStart = node.type === "projectStart";
  const projectStartProjectId = String(
    projectStartNode?.customFields.projectId || "",
  );

  const nodeUuid = projectNodeUuid(node, projectStartNode);
  const initialProjectId = isProjectStart
    ? legacyJobNumberFromProjectId(String(node.customFields.projectId || "")) ||
      String(node.customFields.legacyJobNumber || node.customFields.projectNumber || "").replace(/\D/g, "").slice(0, 5)
    : "";

  const [projectIdDraft, setProjectIdDraft] = useState(initialProjectId);
  const [syncedProjectId, setSyncedProjectId] = useState(initialProjectId);

  if (initialProjectId !== syncedProjectId) {
    setSyncedProjectId(initialProjectId);
    setProjectIdDraft(initialProjectId);
  }

  const projectIdSnapshotRef = useRef<typeof node | null>(null);
  const projectIdValid = isProjectStart
    ? /^\d{5}$/.test(projectIdDraft)
    : Boolean(projectStartProjectId);

  const projectIdError =
    isProjectStart && projectIdDraft.trim().length > 0 && !projectIdValid;

  const legacyJobNumber = isProjectStart
    ? projectIdDraft
    : legacyJobNumberFromProjectId(projectStartProjectId);

  const writeCustomFields = (
    patch: Record<string, string | number | boolean>,
  ) => {
    const nextPatch =
      isProjectStart && "projectId" in patch
        ? {
            ...patch,
            legacyJobNumber: legacyJobNumberFromProjectId(
              String(patch.projectId || ""),
            ),
          }
        : patch;

    commitTransient((file) => {
      const nextNumber = isProjectStart && "projectId" in patch
        ? legacyJobNumberFromProjectId(String(patch.projectId || "")) : "";
      const name = file.graph.metadata.name;
      return {
        ...file,
        graph: {
          ...file.graph,
          metadata: nextNumber
            ? { ...file.graph.metadata, name: syncProjectNameIdentity(name, nextNumber) }
            : file.graph.metadata,
          nodes: file.graph.nodes.map((item) =>
            item.id === node.id
              ? { ...item, customFields: { ...item.customFields, ...nextPatch } }
              : item,
          ),
        },
      };
    });
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
