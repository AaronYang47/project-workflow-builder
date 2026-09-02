import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createDefaultDetailedLifecycle } from "../src/lib/detailed-workflow";
import { createExecutionItem } from "../src/lib/execution";
import { validateWorkflow } from "../src/lib/validation";
import { deleteNodesFromFile } from "../src/lib/workflow-graph";
import { migrateWorkflowFile } from "../src/lib/workflow-migration";
import type { DomainNode } from "../src/types/workflow";

test.describe("L1 / L2 / L3 reference integrity", () => {
  test("deleting a custom L2 node cleans both L1 links, custom L3, and dangling conditions", () => {
    const file = createDefaultDetailedLifecycle();
    const customNode = createDomainNode("general", "custom-stage");
    customNode.title = "Custom stage";
    customNode.config.stage = "Custom";
    file.graph.nodes.push(customNode);
    file.layout.nodes[customNode.id] = {
      nodeId: customNode.id,
      x: 500,
      y: 2_000,
      width: 300,
      height: 180,
    };

    const highLevelNode = file.highLevel!.graph.nodes.find(
      (node) => node.id === "high-level-4",
    )!;
    highLevelNode.linkedLayer2NodeIds = [
      "pre-construction",
      customNode.id,
    ];
    highLevelNode.linkedDetailedNodeIds = [
      customNode.id,
    ];

    const customItem = createExecutionItem(
      "custom-stage-evidence",
      customNode.id,
      "Evidence",
    );
    customItem.title = "Custom stage evidence";
    file.execution!.items.push(customItem);

    const controlledCec = file.execution!.items.find(
      (item) => item.id === "exec-precon-cec",
    )!;
    controlledCec.linkedLayer2NodeId = customNode.id;
    controlledCec.formValues = {
      projectName: "Preserve this completed form data",
    };

    const survivingNode = file.graph.nodes.find(
      (node) => node.id === "gate-g1-qualified",
    )!;
    survivingNode.conditions.push({
      id: "custom-evidence-link",
      label: "Custom evidence is ready",
      linkedExecutionItemId: customItem.id,
    });
    const survivingEdge = file.graph.edges.find(
      (edge) => edge.id === "lifecycle-start-to-g1",
    )!;
    survivingEdge.condition = {
      id: "custom-edge-evidence-link",
      linkedExecutionItemId: customItem.id,
    };

    const result = deleteNodesFromFile(file, [customNode.id]);

    const nextHighLevelNode = result.highLevel!.graph.nodes.find(
      (node) => node.id === highLevelNode.id,
    )!;
    expect(nextHighLevelNode.linkedLayer2NodeIds).toEqual([
      "pre-construction",
    ]);
    expect(nextHighLevelNode.linkedDetailedNodeIds).toEqual([]);
    expect(
      result.execution!.items.some((item) => item.id === customItem.id),
    ).toBe(false);

    const nextCec = result.execution!.items.find(
      (item) => item.id === controlledCec.id,
    )!;
    expect(nextCec.linkedLayer2NodeId).toBe("pre-construction");
    expect(nextCec.formValues).toEqual(controlledCec.formValues);
    expect(
      result.graph.nodes
        .find((node) => node.id === survivingNode.id)!
        .conditions.find((condition) => condition.id === "custom-evidence-link")
        ?.linkedExecutionItemId,
    ).toBeUndefined();
    expect(
      result.graph.edges.find((edge) => edge.id === survivingEdge.id)?.condition
        ?.linkedExecutionItemId,
    ).toBeUndefined();

    const crossLayerIssues = validateWorkflow(result).filter((issue) =>
      [
        "BROKEN_L1_L2_REFERENCE",
        "BROKEN_L3_L2_REFERENCE",
        "BROKEN_L2_L3_REFERENCE",
        "NONCANONICAL_CONTROLLED_FORM_LINK",
      ].includes(issue.code),
    );
    expect(crossLayerIssues).toEqual([]);
  });

  test("migrating a legacy Commercial Pathway removes it without recreating Opportunity", () => {
    const file = createDefaultDetailedLifecycle();
    const legacyPathway = createDomainNode("general", "commercial-pathway");
    legacyPathway.title = "Commercial Pathway";
    legacyPathway.config.commercialPathway = true;
    legacyPathway.metadata = {
      workflowSection: "Opportunity Qualification Module",
      opportunityModuleRole: "commercial-path",
    };
    file.graph.nodes.push(legacyPathway);
    file.layout.nodes[legacyPathway.id] = {
      nodeId: legacyPathway.id,
      x: 1_200,
      y: 220,
      width: 460,
      height: 720,
    };
    file.graph.edges.push(
      {
        id: "legacy-g1-to-commercial",
        source: "gate-g1-qualified",
        target: legacyPathway.id,
        type: "success",
        sourceHandle: "out",
        targetHandle: "in",
        label: "Qualified & engaged",
        lineStyle: "solid",
        arrowStyle: "closed",
        customFields: {},
      },
      {
        id: "legacy-commercial-to-precon",
        source: legacyPathway.id,
        target: "pre-construction",
        type: "normal",
        sourceHandle: "out",
        targetHandle: "in",
        label: "Path selected",
        lineStyle: "solid",
        arrowStyle: "closed",
        customFields: {},
      },
    );
    const highLevelNode = file.highLevel!.graph.nodes.find(
      (node) => node.id === "high-level-3",
    )!;
    highLevelNode.linkedLayer2NodeIds = [
      "gate-g1-qualified",
      legacyPathway.id,
      "approval-matrix",
    ];
    highLevelNode.linkedDetailedNodeIds = [...highLevelNode.linkedLayer2NodeIds];
    const legacyForm = file.execution!.items.find((item) => item.id === "exec-csa")!;
    legacyForm.linkedLayer2NodeId = legacyPathway.id;
    legacyForm.formValues = { scope: "Preserve the completed legacy form" };

    const result = migrateWorkflowFile(file);

    expect(result.graph.nodes.some((node) => node.id === legacyPathway.id)).toBe(false);
    expect(
      result.graph.nodes.some(
        (node) => node.title.trim().toLowerCase() === "commercial pathway",
      ),
    ).toBe(false);
    expect(
      result.graph.edges.some(
        (edge) => edge.source === legacyPathway.id || edge.target === legacyPathway.id,
      ),
    ).toBe(false);
    expect(result.layout.nodes[legacyPathway.id]).toBeUndefined();
    expect(
      result.highLevel!.graph.nodes.flatMap(
        (node) => node.linkedLayer2NodeIds || [],
      ),
    ).not.toContain(legacyPathway.id);
    expect(result.execution!.items.some((item) => item.linkedLayer2NodeId === legacyPathway.id)).toBe(false);
    expect(result.graph.nodes.some((node) => node.id === "opportunity-intake")).toBe(false);
    expect(result.execution!.items.find((item) => item.id === legacyForm.id)).toMatchObject({
      linkedLayer2NodeId: "pre-construction",
    });
  });

  test("migrating legacy Opportunity Qualification records purges every module artifact", () => {
    const file = createDefaultDetailedLifecycle();
    const legacyIds = [
      "opportunity-intake",
      "opportunity-validation",
      "opportunity-hold",
      "opportunity-no-go",
      "hold-gap-rework",
      "no-go-archive",
      "opportunityValidation-legacy-section",
    ];
    const legacyNodes = legacyIds.map((id) => {
      const node = createDomainNode("general", id);
      node.title = id === "opportunity-intake" ? "Opportunity Qualification" : id;
      return (id === "opportunity-intake"
        ? {
            ...node,
            type: "opportunityValidation",
            config: { ...node.config, opportunity: { legacy: true } },
          }
        : node) as unknown as DomainNode;
    });
    file.graph.nodes.push(...legacyNodes);
    for (const [index, node] of legacyNodes.entries()) {
      file.layout.nodes[node.id] = {
        nodeId: node.id,
        x: 1_000 + index * 320,
        y: 1_600,
        width: 280,
        height: 180,
      };
      file.graph.edges.push({
        ...file.graph.edges[0],
        id: `legacy-opportunity-edge-${index}`,
        source: index === 0 ? "project-start" : legacyNodes[index - 1].id,
        target: node.id,
      });
      file.execution!.items.push(
        createExecutionItem(`legacy-opportunity-item-${index}`, node.id, "Evidence"),
      );
    }
    const highLevelNode = file.highLevel!.graph.nodes[1];
    highLevelNode.linkedLayer2NodeIds = [...legacyIds];
    highLevelNode.linkedDetailedNodeIds = [...legacyIds];

    const result = migrateWorkflowFile(JSON.parse(JSON.stringify(file)) as typeof file);
    const hasLegacyOpportunityId = (id: string) =>
      legacyIds.includes(id) ||
      id.startsWith("opportunityValidation-") ||
      id.startsWith("opportunity-section-") ||
      id.startsWith("opportunity-");

    expect(result.graph.nodes.some((node) => hasLegacyOpportunityId(node.id))).toBe(false);
    expect(Object.keys(result.layout.nodes).some(hasLegacyOpportunityId)).toBe(false);
    expect(
      result.graph.edges.some(
        (edge) => hasLegacyOpportunityId(edge.source) || hasLegacyOpportunityId(edge.target),
      ),
    ).toBe(false);
    expect(
      result.highLevel!.graph.nodes.some((node) =>
        (node.linkedLayer2NodeIds || []).some(hasLegacyOpportunityId),
      ),
    ).toBe(false);
    expect(
      result.execution!.items.some((item) => hasLegacyOpportunityId(item.linkedLayer2NodeId)),
    ).toBe(false);
  });

  test("migrating retired matrix nodes removes their graph, layout, L1, and L3 artifacts", () => {
    const file = createDefaultDetailedLifecycle();
    const approvalMatrix = createDomainNode("approvalMatrix", "legacy-approval-matrix");
    const responsibilityMatrix = createDomainNode(
      "responsibilityLane",
      "legacy-responsibility-matrix",
    );
    file.graph.nodes.push(approvalMatrix, responsibilityMatrix);
    file.layout.nodes[approvalMatrix.id] = {
      nodeId: approvalMatrix.id,
      x: 900,
      y: 1_500,
      width: 360,
      height: 190,
    };
    file.layout.nodes[responsibilityMatrix.id] = {
      nodeId: responsibilityMatrix.id,
      x: 1_300,
      y: 1_500,
      width: 360,
      height: 190,
    };
    file.graph.edges.push({
      ...file.graph.edges[0],
      id: "legacy-matrix-link",
      source: approvalMatrix.id,
      target: responsibilityMatrix.id,
    });
    const highLevelNode = file.highLevel!.graph.nodes.find(
      (node) => node.id === "high-level-4",
    )!;
    highLevelNode.linkedLayer2NodeIds = [
      "pre-construction",
      approvalMatrix.id,
      responsibilityMatrix.id,
    ];
    highLevelNode.linkedDetailedNodeIds = [...highLevelNode.linkedLayer2NodeIds];
    const matrixItem = createExecutionItem(
      "legacy-matrix-item",
      approvalMatrix.id,
      "Evidence",
    );
    file.execution!.items.push(matrixItem);

    const result = migrateWorkflowFile(file);
    const retiredIds = new Set([approvalMatrix.id, responsibilityMatrix.id]);

    expect(
      result.graph.nodes.some((node) => retiredIds.has(node.id)),
    ).toBe(false);
    expect(
      result.graph.edges.some(
        (edge) => retiredIds.has(edge.source) || retiredIds.has(edge.target),
      ),
    ).toBe(false);
    expect(result.layout.nodes[approvalMatrix.id]).toBeUndefined();
    expect(result.layout.nodes[responsibilityMatrix.id]).toBeUndefined();
    expect(
      result.highLevel!.graph.nodes.flatMap(
        (node) => node.linkedLayer2NodeIds || [],
      ),
    ).not.toEqual(expect.arrayContaining([...retiredIds]));
    expect(
      result.execution!.items.some((item) => item.id === matrixItem.id),
    ).toBe(false);
  });

  test("deleting a canonical L2 node preserves controlled forms and reports their broken link", () => {
    const file = createDefaultDetailedLifecycle();
    const highLevelNode = file.highLevel!.graph.nodes.find(
      (node) => node.id === "high-level-4",
    )!;
    highLevelNode.linkedLayer2NodeIds = [
      "pre-construction",
    ];
    highLevelNode.linkedDetailedNodeIds = [
      "pre-construction",
    ];

    const customItem = createExecutionItem(
      "custom-preconstruction-note",
      "pre-construction",
      "Task",
    );
    file.execution!.items.push(customItem);
    const controlledCec = file.execution!.items.find(
      (item) => item.id === "exec-precon-cec",
    )!;
    controlledCec.formValues = { projectName: "Filled CEC survives deletion" };

    const result = deleteNodesFromFile(file, ["pre-construction"]);

    const nextHighLevelNode = result.highLevel!.graph.nodes.find(
      (node) => node.id === highLevelNode.id,
    )!;
    expect(nextHighLevelNode.linkedLayer2NodeIds).toEqual([]);
    expect(nextHighLevelNode.linkedDetailedNodeIds).toEqual([]);
    expect(
      result.execution!.items.some((item) => item.id === customItem.id),
    ).toBe(false);

    const nextCec = result.execution!.items.find(
      (item) => item.id === controlledCec.id,
    )!;
    expect(nextCec.linkedLayer2NodeId).toBe("pre-construction");
    expect(nextCec.formValues).toEqual(controlledCec.formValues);

    expect(validateWorkflow(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `broken-l3-l2-${controlledCec.id}-pre-construction`,
          code: "BROKEN_L3_L2_REFERENCE",
          severity: "error",
        }),
      ]),
    );
  });

  test("validation detects every cross-layer broken-reference direction", () => {
    const file = createDefaultDetailedLifecycle();
    const highLevelNode = file.highLevel!.graph.nodes[0];
    highLevelNode.linkedLayer2NodeIds = ["missing-l2-from-current-link"];
    highLevelNode.linkedDetailedNodeIds = ["missing-l2-from-legacy-link"];

    const brokenL3Item = createExecutionItem(
      "orphan-l3-item",
      "missing-l2-from-execution",
      "Task",
    );
    brokenL3Item.title = "Orphan L3 item";
    file.execution!.items.push(brokenL3Item);

    file.graph.nodes[0].conditions.push({
      id: "missing-l3-node-condition",
      linkedExecutionItemId: "missing-l3-from-node-condition",
    });
    file.graph.edges[0].condition = {
      id: "missing-l3-edge-condition",
      linkedExecutionItemId: "missing-l3-from-edge-condition",
    };

    const controlledCec = file.execution!.items.find(
      (item) => item.id === "exec-precon-cec",
    )!;
    controlledCec.linkedLayer2NodeId = "missing-l2-from-controlled-form";

    const issues = validateWorkflow(file);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "broken-l1-l2-high-level-1-missing-l2-from-current-link",
          code: "BROKEN_L1_L2_REFERENCE",
        }),
        expect.objectContaining({
          id: "broken-l1-l2-high-level-1-missing-l2-from-legacy-link",
          code: "BROKEN_L1_L2_REFERENCE",
        }),
        expect.objectContaining({
          id: "broken-l3-l2-orphan-l3-item-missing-l2-from-execution",
          code: "BROKEN_L3_L2_REFERENCE",
        }),
        expect.objectContaining({
          code: "BROKEN_L2_L3_REFERENCE",
          nodeId: "project-start",
        }),
        expect.objectContaining({
          code: "BROKEN_L2_L3_REFERENCE",
          edgeId: file.graph.edges[0].id,
        }),
        expect.objectContaining({
          id: `broken-l3-l2-${controlledCec.id}-missing-l2-from-controlled-form`,
          code: "BROKEN_L3_L2_REFERENCE",
        }),
      ]),
    );
  });
});

test("current lifecycle migration remains idempotent and free of retired modules", () => {
  const file = createDefaultDetailedLifecycle();
  const first = migrateWorkflowFile(
    JSON.parse(JSON.stringify(file)) as typeof file,
  );
  const second = migrateWorkflowFile(
    JSON.parse(JSON.stringify(first)) as typeof first,
  );

  expect(second).toEqual(first);
  expect(first.graph.nodes.some((node) => node.id.startsWith("opportunity"))).toBe(false);
  expect(first.graph.nodes.some((node) => node.id.startsWith("commercial-pathway"))).toBe(false);
  expect(
    first.execution!.items.some((item) =>
      item.linkedLayer2NodeId.startsWith("opportunity") ||
      item.linkedLayer2NodeId.startsWith("commercial-pathway"),
    ),
  ).toBe(false);
});
