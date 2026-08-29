import { useMemo, useRef, useState } from "react";
import {
  PROJECT_ID_PATTERN,
  currentYearSuffix,
  legacyJobNumberFromProjectId,
  normalizeProjectId,
  projectNodeUuid,
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
    ? String(
        node.customFields.projectId || node.customFields.projectNumber || "",
      )
    : "";

  const [projectIdDraft, setProjectIdDraft] = useState(initialProjectId);
  const [syncedProjectId, setSyncedProjectId] = useState(initialProjectId);

  if (initialProjectId !== syncedProjectId) {
    setSyncedProjectId(initialProjectId);
    setProjectIdDraft(initialProjectId);
  }

  const projectIdSnapshotRef = useRef<typeof node | null>(null);
  const projectId = useMemo(
    () => normalizeProjectId(projectIdDraft.trim()),
    [projectIdDraft],
  );

  const draftHasContent = projectIdDraft.length > 0;

  const parsedYear = useMemo(() => {
    if (!draftHasContent) return currentYearSuffix();
    const match = projectIdDraft.match(/^[LP]-(\d{0,2})-/);
    return match ? match[1] : "";
  }, [projectIdDraft, draftHasContent]);

  const parsedSeq = useMemo(() => {
    if (!draftHasContent) return "001";
    const match = projectIdDraft.match(/^[LP]-\d{0,2}-(\d{0,3})$/);
    return match ? match[1] : "";
  }, [projectIdDraft, draftHasContent]);

  const projectIdValid = isProjectStart
    ? PROJECT_ID_PATTERN.test(projectIdDraft.trim())
    : Boolean(projectStartProjectId);

  const projectIdError =
    isProjectStart && projectIdDraft.trim().length > 0 && !projectIdValid;

  const legacyJobNumber = isProjectStart
    ? legacyJobNumberFromProjectId(projectId)
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

    commitTransient((file) => ({
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                customFields: { ...item.customFields, ...nextPatch },
              }
            : item,
        ),
      },
    }));
  };

  return {
    isProjectStart,
    projectStartProjectId,
    nodeUuid,
    projectIdDraft,
    setProjectIdDraft,
    projectIdSnapshotRef,
    projectId,
    parsedYear,
    parsedSeq,
    projectIdValid,
    projectIdError,
    legacyJobNumber,
    writeCustomFields,
  };
}
