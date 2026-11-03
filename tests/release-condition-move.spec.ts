import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { useWorkflowStore } from "../src/store/workflow-store";
import { RELEASE_CONDITION_INBOX_ID } from "../src/lib/release-condition-inbox";
import { createExecutionItem } from "../src/lib/execution";
import { validateWorkflow } from "../src/lib/validation";

test("moving a scheduled condition updates every predecessor reference and preserves L3 evidence", () => {
  const file = createProjectWorkflow("Move scheduled condition");
  const first = createDomainNode("general", "schedule-source");
  const second = createDomainNode("general", "schedule-target");
  first.conditions = [{ id: "scheduled", label: "Design", duration: 2, durationUnit: "weeks", linkedExecutionItemId: "design-form" }];
  second.conditions = [{ id: "dependent", label: "Approval", predecessor: { nodeId: first.id, conditionId: "scheduled" } }];
  file.graph.nodes = [first, second];
  file.execution = { items: [createExecutionItem("design-form", first.id)] };
  file.releaseConditionInbox = [{ id: "inbox-dependent", label: "Later", predecessor: { nodeId: first.id, conditionId: "scheduled", relation: "start", lagDays: 3 } }];
  useWorkflowStore.getState().replaceFile(file);
  useWorkflowStore.getState().moveNodeCondition(first.id, 0, second.id, 0);
  const moved = useWorkflowStore.getState().file;
  expect(moved.graph.nodes.find((node) => node.id === second.id)?.conditions[0]).toMatchObject({ id: "scheduled", duration: 2, durationUnit: "weeks", linkedExecutionItemId: "design-form" });
  expect(moved.graph.nodes.find((node) => node.id === second.id)?.conditions[1].predecessor).toEqual({ nodeId: second.id, conditionId: "scheduled" });
  expect(moved.releaseConditionInbox?.[0].predecessor).toEqual({ nodeId: second.id, conditionId: "scheduled", relation: "start", lagDays: 3 });
  expect(moved.execution?.items[0].linkedLayer2NodeId).toBe(second.id);
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === second.id)?.conditions[0].predecessor?.nodeId).toBe(first.id);
});

test("moving an RC to a later phase removes its old same-phase predecessor and undo restores it", () => {
  const file = createProjectWorkflow("Cross-phase predecessor repair");
  const first = createDomainNode("general", "dependency-source");
  const second = createDomainNode("general", "dependency-target");
  first.conditions = [{ id: "design", label: "Design", duration: 2 }, { id: "approval", label: "Approval", duration: 1, predecessor: { nodeId: first.id, conditionId: "design" } }];
  file.graph.nodes = [first, second];
  file.highLevel!.graph.nodes = [
    { id: "phase-1", type: "phase", title: "PHASE 1", description: "", linkedLayer2NodeIds: [first.id] },
    { id: "phase-2", type: "phase", title: "PHASE 2", description: "", linkedLayer2NodeIds: [second.id] },
  ];
  file.highLevel!.graph.edges = [{ id: "next", source: "phase-1", target: "phase-2" }];
  useWorkflowStore.getState().replaceFile(file);
  useWorkflowStore.getState().moveNodeCondition(first.id, 1, second.id, 0);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === second.id)?.conditions[0].predecessor).toBeUndefined();
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === first.id)?.conditions[1].predecessor).toEqual({ nodeId: first.id, conditionId: "design" });
});

test("linked L3 conditions can be unassigned and reassigned with their evidence and undo history", () => {
  const file = createProjectWorkflow("Linked condition test");
  const first = createDomainNode("general", "first");
  const second = createDomainNode("general", "second");
  first.conditions = [{ id: "linked", label: "Approved evidence", linkedExecutionItemId: "evidence", checked: true }];
  second.conditions = [];
  const field = "legalDocuments::release-condition::linked";
  const documents = JSON.stringify([{ id: "signed", title: "EOI", checked: true, status: "Signed" }]);
  first.customFields = { [field]: documents, unrelated: "retain" };
  file.graph.nodes = [first, second];
  file.execution = { items: [{ ...createExecutionItem("evidence", first.id), notes: "Preserve approval evidence" }] };
  useWorkflowStore.getState().replaceFile(file);
  useWorkflowStore.getState().moveNodeCondition(first.id, 0, RELEASE_CONDITION_INBOX_ID, 0);
  const parked = useWorkflowStore.getState().file;
  expect(parked.releaseConditionInbox?.[0]).toMatchObject({ id: "linked", linkedExecutionItemId: "evidence", checked: true, unassignedDocumentFields: { [field]: documents } });
  expect(parked.execution?.items[0]).toMatchObject({ linkedLayer2NodeId: RELEASE_CONDITION_INBOX_ID, notes: "Preserve approval evidence" });
  expect(validateWorkflow(parked).filter((issue) => issue.code === "BROKEN_L3_L2_REFERENCE")).toEqual([]);
  useWorkflowStore.getState().moveNodeCondition(RELEASE_CONDITION_INBOX_ID, 0, second.id, 0);
  const assigned = useWorkflowStore.getState().file;
  expect(assigned.graph.nodes.find((node) => node.id === second.id)?.customFields?.[field]).toBe(documents);
  expect(assigned.graph.nodes.find((node) => node.id === first.id)?.customFields).toEqual({ unrelated: "retain" });
  expect(assigned.execution?.items[0].linkedLayer2NodeId).toBe(second.id);
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.releaseConditionInbox?.[0].id).toBe("linked");
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === first.id)?.customFields?.[field]).toBe(documents);
  useWorkflowStore.getState().redo();
  expect(useWorkflowStore.getState().file.releaseConditionInbox?.[0].id).toBe("linked");
  useWorkflowStore.getState().setReleaseConditionInbox([]);
  expect(useWorkflowStore.getState().file.execution?.items).toHaveLength(0);
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.execution?.items[0].notes).toBe("Preserve approval evidence");
});

test("release conditions move across nodes and undo/redo as one edit", () => {
  const file = createProjectWorkflow("Move test");
  const first = createDomainNode("general", "first");
  const second = createDomainNode("general", "second");
  first.conditions = [{ id: "a", label: "First", displayDate: "2026-10-07" }, { id: "b", label: "Second" }];
  second.conditions = [{ id: "c", label: "Third" }];
  file.graph.nodes = [first, second];
  useWorkflowStore.getState().replaceFile(file);

  useWorkflowStore.getState().moveNodeCondition("first", 0, "second", 0);
  expect(useWorkflowStore.getState().file.graph.nodes.filter((node) => node.id === "first" || node.id === "second").map((node) => node.conditions.map((item) => item.id)))
    .toEqual([["b"], ["a", "c"]]);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === "second")?.conditions[0].displayDate).toBe("2026-10-07");
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === "first")?.conditions.map((item) => item.id)).toEqual(["a", "b"]);
  useWorkflowStore.getState().redo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === "second")?.conditions.map((item) => item.id)).toEqual(["a", "c"]);
});

test("bulk conditions move from the project inbox into Chapters with one undo step", () => {
  const file = createProjectWorkflow("Inbox test");
  const chapter = createDomainNode("general", "chapter-one");
  chapter.conditions = [];
  file.graph.nodes = [chapter];
  useWorkflowStore.getState().replaceFile(file);

  expect(useWorkflowStore.getState().addReleaseConditionLines("2026-10-26 | Permit drawing\nProduct sheet\n"))
    .toBe(2);
  const pending = useWorkflowStore.getState().file.releaseConditionInbox!;
  expect(pending.map((item) => item.label)).toEqual(["Permit drawing", "Product sheet"]);
  expect(pending[0].displayDate).toBe("2026-10-26");

  useWorkflowStore.getState().moveNodeCondition(RELEASE_CONDITION_INBOX_ID, 0, chapter.id, 0);
  expect(useWorkflowStore.getState().file.releaseConditionInbox?.map((item) => item.label)).toEqual(["Product sheet"]);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapter.id)?.conditions[0].label).toBe("Permit drawing");
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.releaseConditionInbox).toHaveLength(2);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapter.id)?.conditions).toHaveLength(0);
  useWorkflowStore.getState().redo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapter.id)?.conditions[0].displayDate).toBe("2026-10-26");
  useWorkflowStore.getState().moveNodeCondition(chapter.id, 0, RELEASE_CONDITION_INBOX_ID, 1);
  expect(useWorkflowStore.getState().file.releaseConditionInbox?.map((item) => item.label))
    .toEqual(["Product sheet", "Permit drawing"]);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapter.id)?.conditions).toHaveLength(0);
});

test("consecutive edits in one text field share one undo step", () => {
  const file = createProjectWorkflow("Text test");
  const node = createDomainNode("general", "text-node");
  node.conditions = [{ id: "a", label: "A" }];
  file.graph.nodes = [node];
  useWorkflowStore.getState().replaceFile(file);
  const before = useWorkflowStore.getState().past.length;
  useWorkflowStore.getState().updateNode(node.id, { conditions: [{ id: "a", label: "Ab" }] });
  useWorkflowStore.getState().updateNode(node.id, { conditions: [{ id: "a", label: "Abc" }] });
  expect(useWorkflowStore.getState().past.length).toBe(before + 1);
  useWorkflowStore.getState().undo();
  expect(useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === node.id)?.conditions[0].label).toBe("A");
});

test("L1 links reject an L2 phase container", () => {
  const file = createProjectWorkflow("Link test");
  const phase = createDomainNode("phase", "l2-phase");
  const step = createDomainNode("general", "l2-step");
  file.graph.nodes = [phase, step];
  file.highLevel!.graph.nodes = [{ id: "l1-phase", type: "phase", title: "Phase", description: "" }];
  useWorkflowStore.getState().replaceFile(file);
  useWorkflowStore.getState().updateHighLevelNode("l1-phase", {
    linkedLayer2NodeIds: [phase.id, step.id],
  });
  expect(useWorkflowStore.getState().file.highLevel?.graph.nodes[0].linkedLayer2NodeIds).toEqual([step.id]);
});

test("Job Number condition can be reordered within Project Start but cannot leave it", () => {
  const file = createProjectWorkflow("Job Number ordering");
  const start = createDomainNode("projectStart", "start");
  const other = createDomainNode("general", "other");
  start.conditions.push({ id: "second", label: "Gather details" });
  file.graph.nodes = [start, other];
  useWorkflowStore.getState().replaceFile(file);
  useWorkflowStore.getState().moveNodeCondition(start.id, 0, start.id, 1);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === start.id)?.conditions.map((item) => item.id)).toEqual(["second", "project-id-required"]);
  useWorkflowStore.getState().moveNodeCondition(start.id, 1, other.id, 0);
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === start.id)?.conditions.map((item) => item.id)).toEqual(["second", "project-id-required"]);
  useWorkflowStore.getState().deleteNodeCondition(start.id, "project-id-required");
  expect(useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === start.id)?.conditions).toHaveLength(2);
});
