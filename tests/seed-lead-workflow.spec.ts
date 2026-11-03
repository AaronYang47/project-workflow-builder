import { expect, test } from "playwright/test";
import { parseWorkflow } from "../src/lib/serialization";
import {
  createLeadProjectWorkflow,
  normalizeLeadNumber,
  projectIdFromLeadNumber,
} from "../src/lib/seed-lead-workflow";
import { emptySalesQualificationAnswers } from "../src/lib/sales-qualification";

const profile = {
  companyId: "co-1",
  organizationName: "720 Modular",
  legalName: "720 Solutions Inc.",
  tradeName: "720 Modular",
  aliases: [],
  acronyms: [],
  category: "General Contractor / Construction Manager",
  ownershipType: "Private",
  province: "AB",
  city: "Calgary",
  address: "",
  website: "https://720modular.ca",
  domain: "720modular.ca",
  procurementType: "",
  intelligenceSummary: "",
  modularRelevance: "",
  customerQualityScore: 80,
  opportunityScore: 70,
  confidenceScore: 90,
  ratingTier: "",
  summaryVerdict: "",
  keyStrengths: [],
  keyRisks: [],
  keyContacts: [],
};

test("Lead Number L-26-001 normalizes to 26001", () => {
  expect(normalizeLeadNumber("L-26-001")).toBe("26001");
  expect(projectIdFromLeadNumber("26001")).toBe("L-26-001");
});

test("New lead workflow seeds L1 Start, L2 Project Start, and the sales form", () => {
  const file = createLeadProjectWorkflow("26001", {
    customerName: "720 Modular",
    customerCategory: profile.category,
    customerProfile: profile,
    customerForm: emptySalesQualificationAnswers(),
  });
  expect(() => parseWorkflow(JSON.stringify(file))).not.toThrow();
  const start = file.graph.nodes.find((node) => node.type === "projectStart");
  expect(start?.customFields.projectId).toBe("L-26-001");
  expect(start?.customFields.legacyJobNumber).toBe("26001");
  expect(file.highLevel?.graph.nodes.some((node) => node.type === "start")).toBe(true);
  const docs = JSON.parse(
    String(start?.customFields["customerDocuments::release-condition::project-id-required"] || "[]"),
  );
  expect(docs[0].formKind).toBe("customer-selection");
  expect(docs[0].customerName).toBe("720 Modular");
});
