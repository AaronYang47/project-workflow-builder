import { expect, test } from "playwright/test";
import {
  FORM_101_GROUPS,
  firstUnfinishedGroup,
  isForm101GroupComplete,
} from "../src/components/workflow/qualification-form-101/steps";
import { createEmptyQualificationForm101 } from "../src/lib/qualification-form-101";

test("required Qualification groups unlock in order; optional groups never lock", () => {
  const empty = createEmptyQualificationForm101();
  // An empty form opens on the first required group only.
  expect(firstUnfinishedGroup(empty, false, new Set())).toBe(0);
  // Every group before the first unfinished one is required: optional groups never block.
  const firstOptional = FORM_101_GROUPS.findIndex((group) => group.section !== "a");
  const lastRequired = FORM_101_GROUPS.map((group) => group.section).lastIndexOf("a");
  expect(lastRequired).toBeLessThan(firstOptional);
  // Optional groups left empty do not hold the unlock back once required ones are done.
  const unlocked = firstUnfinishedGroup(empty, false, new Set());
  expect(FORM_101_GROUPS[unlocked].section).toBe("a");
  expect(
    FORM_101_GROUPS.slice(firstOptional).every(
      (group) => !isForm101GroupComplete(group, empty, false),
    ),
  ).toBe(true);
});
