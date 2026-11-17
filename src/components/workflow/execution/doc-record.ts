import type { FalconCustomerProfile } from "@/lib/falcon-customer-intelligence";
import type { CustomerFormAnswers } from "../customer-selection-form";

/** A document, form or file attached to an L3 execution node. */
export interface DocRecord {
  id: string;
  title: string;
  code?: string;
  fileName?: string;
  dataUrl?: string;
  url?: string;
  category: "legal" | "customer" | "supporting";
  status: "Required" | "Optional" | "Signed" | "Verified" | "Under Review";
  checked: boolean;
  required: boolean;
  notes?: string;
  sourceItemId?: string;
  formKind?: "customer-selection";
  customerCategory?: string;
  customerName?: string;
  customerProfile?: FalconCustomerProfile;
  customerForm?: CustomerFormAnswers;
}
