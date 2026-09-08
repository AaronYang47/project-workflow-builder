import { expect, test } from "playwright/test";
import {
  emptySalesQualificationAnswers,
  evaluateSalesQualification,
  salesQualificationIsComplete,
  type SalesQualificationAnswers,
} from "../src/lib/sales-qualification";

function answers(patch: Partial<SalesQualificationAnswers>): SalesQualificationAnswers {
  return {
    ...emptySalesQualificationAnswers(),
    decisionAuthority: "Confirmed",
    siteStatus: "Confirmed Site",
    designStage: "Design Development",
    modularCompatibility: "Compatible",
    projectDefinition: "Well Defined",
    budgetStatus: "Indicative",
    fundingStatus: "In Process",
    customerRelationship: "Standard",
    commercialCommitment: "None",
    decisionMakerName: "Jane Smith",
    siteMunicipality: "Ottawa, ON",
    approxGfaStoreys: "4 storeys / 48,000 sf",
    budgetAmount: "12M",
    ...patch,
  };
}

test("Hard Rule: unknown decision authority is Hold even with a high score", () => {
  const result = evaluateSalesQualification(
    answers({
      decisionAuthority: "Unknown",
      decisionMakerName: "",
      designStage: "Controlled Class D Recorded",
      commercialCommitment: "PCS",
      fundingStatus: "Secured",
      budgetStatus: "Confirmed",
    }),
  );
  expect(result.recommendedService).toBe("Hold");
  expect(result.qualificationStatus).toBe("Hold");
  expect(result.hardRuleApplied).toBe(true);
  expect(result.readinessScore).toBeGreaterThan(40);
});

test("No Design routes to CSA and is never automatic No-Go", () => {
  const result = evaluateSalesQualification(
    answers({
      designStage: "No Design",
      approxGfaStoreys: "",
    }),
  );
  expect(result.recommendedService).toBe("CSA");
  expect(result.qualificationStatus).toBe("Qualified with Risk");
});

test("Candidate site routes to Site Feasibility", () => {
  const result = evaluateSalesQualification(answers({ siteStatus: "Candidate Site" }));
  expect(result.recommendedService).toBe("Site Feasibility");
});

test("Fatal unresolvable site is No-Go and score cannot override it", () => {
  const result = evaluateSalesQualification(
    answers({
      siteStatus: "Fatal Issue — Not Resolvable",
      designStage: "Controlled Class D Recorded",
      fundingStatus: "Secured",
      budgetStatus: "Confirmed",
    }),
  );
  expect(result.recommendedService).toBe("No-Go");
  expect(result.hardRuleApplied).toBe(true);
});

test("Permit Issued plus no corrective path is No-Go", () => {
  const result = evaluateSalesQualification(
    answers({
      designStage: "Permit Issued",
      modularCompatibility: "Not Compatible — No Corrective Path",
    }),
  );
  expect(result.recommendedService).toBe("No-Go");
});

test("Controlled Class D routes to PCS", () => {
  const result = evaluateSalesQualification(
    answers({
      designStage: "Controlled Class D Recorded",
      fundingStatus: "Secured",
      budgetStatus: "Confirmed",
    }),
  );
  expect(result.recommendedService).toBe("PCS");
  expect(result.qualificationStatus).toBe("Qualified");
});

test("Strategic returning client with Class D can use governed LOI", () => {
  const result = evaluateSalesQualification(
    answers({
      designStage: "Controlled Class D Recorded",
      customerRelationship: "Strategic / Returning",
      commercialCommitment: "Governed LOI Requested",
      fundingStatus: "Secured",
    }),
  );
  expect(result.recommendedService).toBe("Governed LOI");
});

test("Standard client cannot use governed LOI", () => {
  const result = evaluateSalesQualification(
    answers({
      designStage: "Controlled Class D Recorded",
      customerRelationship: "Standard",
      commercialCommitment: "Governed LOI Requested",
    }),
  );
  expect(result.recommendedService).toBe("Hold");
  expect(result.hardRuleApplied).toBe(true);
});

test("Form is complete only when company, 9 dropdowns, and required extras are filled", () => {
  expect(salesQualificationIsComplete(false, answers({}))).toBe(false);
  expect(salesQualificationIsComplete(true, answers({ decisionMakerName: "" }))).toBe(false);
  expect(salesQualificationIsComplete(true, answers({}))).toBe(true);
});
