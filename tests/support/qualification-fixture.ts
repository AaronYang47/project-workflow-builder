import {
  createEmptyQualificationForm101,
  type QualificationForm101,
} from "../../src/lib/qualification-form-101";

/** A Qualification Form filled in well enough for Grade B (Sales may submit it). */
export function gradeBForm(): QualificationForm101 {
  const form = createEmptyQualificationForm101();
  const a = form.sectionA;
  a.projectName = "Maison Laurier";
  a.projectAddress = "120 rue Principale, Lévis, QC";
  a.parties.owner = { company: "Immeubles Laurier", contact: "Marie Tremblay" };
  a.parties.gc = { company: "Construction Côté", contact: "Luc Côté" };
  a.mainContact = {
    name: "Marie Tremblay",
    companyRole: "Owner rep",
    email: "marie@example.com",
    phone: "418-555-0199",
  };
  a.occupancyGroups = ["C"];
  a.grossAreaSqFt = "48,000";
  for (const key of Object.keys(a.consultants) as (keyof typeof a.consultants)[])
    a.consultants[key] = { name: "", company: "", contact: "", status: "na" };
  // Left for the tests to fill in.
  a.consultants.civil = { name: "", company: "", contact: "" };
  a.consultants.structural = { name: "", company: "", contact: "" };
  a.budgetEstablished = "yes";
  a.projectBudgetCad = "1,250,000";
  a.depositReceived = "yes";
  for (const key of Object.keys(a.targetDates) as (keyof typeof a.targetDates)[])
    a.targetDates[key] = "2027.06.01";
  for (const key of Object.keys(a.documents) as (keyof typeof a.documents)[])
    a.documents[key] = { available: "yes", locationOrDate: "Drive" };
  a.latestDrawings = [
    {
      id: "d1",
      drawingName: "A-100",
      revisionNumber: "3",
      revisionDate: "2026.11.10",
      issueStatus: "Issued for Permit",
      exactLocation: "Drive/Arch",
    },
  ];
  return form;
}
