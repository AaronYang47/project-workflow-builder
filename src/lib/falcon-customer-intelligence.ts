import catalog from "@/data/falcon-customer-catalog.json";

export type FalconCustomerRecord = {
  category: string;
  organizationName: string;
};

export const FALCON_CUSTOMER_CATALOG = catalog as FalconCustomerRecord[];

export const CUSTOMER_SELECTION_FORM_ID = "falcon-customer-selection-form";
export const CUSTOMER_SELECTION_FORM_FILE_NAME = "Customer_Selection_Form.json";

export function isCustomerSelectionForm(record: {
  id?: string;
  fileName?: string;
  formKind?: string;
}): boolean {
  return (
    record.formKind === "customer-selection" ||
    record.id === CUSTOMER_SELECTION_FORM_ID ||
    record.fileName === CUSTOMER_SELECTION_FORM_FILE_NAME
  );
}

export function getFalconCustomerCategories(): string[] {
  return [...new Set(FALCON_CUSTOMER_CATALOG.map((item) => item.category))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function getFalconCustomersByCategory(category: string): string[] {
  return FALCON_CUSTOMER_CATALOG.filter((item) => item.category === category)
    .map((item) => item.organizationName)
    .sort((a, b) => a.localeCompare(b));
}
