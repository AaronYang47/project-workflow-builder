import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { orderReleaseConditionChapters } from "../src/lib/release-condition-order";

test("Release Conditions board follows the linked L1 chapter order", () => {
  const file = createProjectWorkflow("L1 chapter order");
  const first = createDomainNode("general", "chapter-first");
  const second = createDomainNode("general", "chapter-second");
  const unlinked = createDomainNode("general", "chapter-unlinked");
  first.title = "Chapter First";
  second.title = "Chapter Second";
  unlinked.title = "Unlinked Chapter";
  file.graph.nodes = [first, second, unlinked];
  file.highLevel!.graph.nodes = [
    {
      id: "l1-start",
      type: "start",
      title: "Start",
      description: "",
      linkedLayer2NodeIds: [],
      linkedDetailedNodeIds: [],
    },
    {
      id: "l1-phase",
      type: "phase",
      title: "Department Flow",
      description: "",
      linkedLayer2NodeIds: [second.id, first.id],
      linkedDetailedNodeIds: [second.id, first.id],
    },
  ];
  file.highLevel!.graph.edges = [{ id: "start-phase", source: "l1-start", target: "l1-phase" }];

  expect(orderReleaseConditionChapters([first, second, unlinked], file).map((chapter) => chapter.id)).toEqual([
    second.id,
    first.id,
    unlinked.id,
  ]);
});
