import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { ensureEstimationWorkflow } from "../src/lib/estimation-workflow";
import { migrateWorkflowFile } from "../src/lib/workflow-migration";
import { createE2EWorkflow } from "./support/e2e-workflow";

test("reloading keeps lines the user rewired and links a Department placed in a Phase frame", () => {
  const base = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-1");
  base.graph.nodes.unshift(qualification);
  base.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: 0,
    y: 100,
    width: 440,
    height: 460,
  };
  const file = ensureEstimationWorkflow(base);
  const group = file.graph.nodes.find((node) => node.config.commercialRouteGroup === true)!;

  // The user puts a new Department between Qualification and Route Selection.
  const department = createDomainNode("general", "general-new-sales");
  file.graph.nodes.push(department);
  const frame = file.graph.nodes.find((node) => node.type === "phase");
  file.layout.nodes[department.id] = {
    nodeId: department.id,
    x: 500,
    y: 120,
    width: 380,
    height: 400,
    parentId: frame?.id,
  };
  file.graph.edges = file.graph.edges.filter(
    (edge) => !(edge.source === qualification.id && edge.target === group.id),
  );
  const line = (source: string, target: string) => ({
    id: `edge-${source}-${target}`,
    source,
    target,
    sourceHandle: "out",
    targetHandle: "in",
    type: "normal" as const,
    lineStyle: "solid" as const,
    arrowStyle: "closed" as const,
    customFields: {},
  });
  file.graph.edges.push(line(qualification.id, department.id), line(department.id, group.id));

  const lines = (value: typeof file) =>
    value.graph.edges.map((edge) => `${edge.source}>${edge.target}`).sort();
  const reloaded = migrateWorkflowFile(structuredClone(file));
  // Nothing is rewired on load: no line back from Qualification, none moved to Estimation.
  expect(lines(reloaded)).toEqual(lines(file));
  expect(lines(migrateWorkflowFile(reloaded))).toEqual(lines(file));

  if (frame) {
    // The Department inside a Phase frame is now one of that Phase's Departments on L1.
    const linked = reloaded.highLevel!.graph.nodes.some((level) =>
      (level.linkedLayer2NodeIds ?? []).includes(department.id),
    );
    expect(linked).toBe(true);
  }
});
