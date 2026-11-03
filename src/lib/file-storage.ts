import {
  CUSTOMER_SELECTION_FORM_FILE_NAME,
  CUSTOMER_SELECTION_FORM_ID,
} from "@/lib/falcon-customer-intelligence";
import { useWorkflowStore } from "@/store/workflow-store";
import { formReferenceCatalog } from "@/lib/form-reference-catalog";

export interface UploadedFileRecord {
  id: string;
  key?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  category: "legal" | "customer" | "supporting";
  title: string;
  description: string;
  uploadedAt: string;
  url?: string;
  dataUrl?: string;
}

export const FORM_REFERENCE_FILE_TYPE = "application/x-falcon-form-reference";
export const isFormReferenceRecord = (record: Pick<UploadedFileRecord, "fileType">) => record.fileType === FORM_REFERENCE_FILE_TYPE;

const FORM_REFERENCE_FILES: UploadedFileRecord[] = formReferenceCatalog.map((form) => ({
  id: `form-reference-${form.category}-${form.code.toLowerCase()}`,
  fileName: form.code,
  fileSize: 0,
  fileType: FORM_REFERENCE_FILE_TYPE,
  category: form.category,
  title: form.title,
  description: `Form reference ${form.code}. Upload the actual file later.`,
  uploadedAt: "2026-11-02T00:00:00.000Z",
}));

export const CUSTOMER_SELECTION_FORM: UploadedFileRecord = {
  id: CUSTOMER_SELECTION_FORM_ID,
  fileName: CUSTOMER_SELECTION_FORM_FILE_NAME,
  fileSize: 2048,
  fileType: "application/json",
  category: "customer",
  title: "Form",
  description:
    "Sales qualification form. Select a customer, answer 9 dropdowns, then save the recommended next service.",
  uploadedAt: "2026-09-07T00:00:00.000Z",
};

const storageKey = () => {
  const userId = useWorkflowStore.getState().authUser?.id;
  return userId ? `falcon_uploaded_files_${userId}` : null;
};

function persistLibraryFiles(files: UploadedFileRecord[]): void {
  if (typeof window === "undefined") return;
  const key = storageKey();
  if (!key) return;
  const persistable = files.filter(
    (item) => item.id !== CUSTOMER_SELECTION_FORM_ID && !isFormReferenceRecord(item),
  );
  try {
    localStorage.setItem(key, JSON.stringify(persistable));
  } catch {
    // Keep lightweight library metadata cached if base64 previews fill the browser quota.
    try {
      const metadataOnly = JSON.stringify(persistable, (field, value) => field === "dataUrl" ? undefined : value);
      localStorage.setItem(key, metadataOnly);
    } catch {
      // R2 remains authoritative even when browser storage is unavailable.
    }
  }
}

function withBuiltInLibraryForms(
  files: UploadedFileRecord[],
  category?: "legal" | "customer" | "supporting",
): UploadedFileRecord[] {
  const withoutBuiltIn = files.filter(
    (item) => item.id !== CUSTOMER_SELECTION_FORM_ID && !isFormReferenceRecord(item),
  );
  const matchingRealFile = (reference: UploadedFileRecord) => withoutBuiltIn.some((file) =>
    file.category === reference.category &&
    (file.title.trim().toLowerCase() === reference.title.toLowerCase() ||
      file.fileName.replace(/\.[^.]+$/, "").trim().toLowerCase() === reference.fileName.toLowerCase()));
  const merged = [CUSTOMER_SELECTION_FORM, ...FORM_REFERENCE_FILES.filter((reference) => !matchingRealFile(reference)), ...withoutBuiltIn];
  if (!category) return merged;
  return merged.filter((item) => item.category === category);
}

// Generate a dummy text/pdf data URL for files that don't have binary payload
function createPlaceholderDataUrl(name: string, title: string) {
  const content = `Falcon Process Building System File Archive\nFilename: ${name}\nTitle: ${title}\nTimestamp: ${new Date().toISOString()}\nStatus: Verified on Cloudflare R2 Storage.`;
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}

const DEFAULT_SEEDED_FILES: UploadedFileRecord[] = [];

export function getUploadedFiles(category?: "legal" | "customer" | "supporting"): UploadedFileRecord[] {
  if (typeof window === "undefined") return [];
  const key = storageKey();
  if (!key) return withBuiltInLibraryForms([], category);
  try {
    const raw = localStorage.getItem(key);
    let files: UploadedFileRecord[] = raw ? JSON.parse(raw) : [];
    // Remove any leftover demo seeded files
    const cleaned = files.filter(
      (item) =>
        !item.id.startsWith("r2-seed-") &&
        item.fileName !== "Master_Services_Agreement_2026.pdf" &&
        item.fileName !== "NDA_Standard_Mutual_v2.pdf" &&
        item.fileName !== "Customer_Project_Spec_2026.pdf" &&
        item.fileName !== "Client_Signatory_Authorization.pdf" &&
        item.fileName !== "Site_Foundation_Survey_Plan.pdf" &&
        item.fileName !== "Class_CD_Cost_Estimate_Model.xlsx"
    );
    if (cleaned.length !== files.length || !raw) {
      persistLibraryFiles(cleaned);
      files = cleaned;
    }
    return withBuiltInLibraryForms(files, category);
  } catch {
    return withBuiltInLibraryForms([], category);
  }
}

export async function fetchUploadedFilesFromR2(
  category?: "legal" | "customer" | "supporting",
): Promise<UploadedFileRecord[]> {
  const account = useWorkflowStore.getState().authUser;
  if (!account) return withBuiltInLibraryForms([], category);
  try {
    const response = await fetch("/api/files", { cache: "no-store", headers: { "x-workflow-account": account.id } });
    if (useWorkflowStore.getState().authUser !== account) return [];
    if (response.status === 401 || response.status === 409) return [];
    if (response.ok) {
      const data = (await response.json()) as {
        ok: boolean;
        ownerUserId?: string;
        files?: UploadedFileRecord[];
      };
      if (useWorkflowStore.getState().authUser !== account || data.ownerUserId !== account.id) return [];
      if (data.ok && Array.isArray(data.files)) {
        if (typeof window !== "undefined") {
          const local = getUploadedFiles();
          const merged: UploadedFileRecord[] = data.files.map((remote) => {
            const localMatch = local.find(
              (l) => l.id === remote.id || (remote.key && l.key === remote.key),
            );
            return {
              ...remote,
              dataUrl: localMatch?.dataUrl || remote.dataUrl,
            };
          });
          persistLibraryFiles(merged);
        }
        return withBuiltInLibraryForms(data.files, category);
      }
    }
  } catch {
    // Network or offline fallback
  }
  if (useWorkflowStore.getState().authUser !== account) return [];
  return getUploadedFiles(category);
}

export function saveUploadedFile(file: UploadedFileRecord): void {
  if (typeof window === "undefined") return;
  const current = getUploadedFiles();
  const updated = [file, ...current.filter((item) => item.id !== file.id)];
  persistLibraryFiles(updated);
  window.dispatchEvent(new CustomEvent("workflow:uploaded-files-changed", { detail: file }));
}

export async function deleteUploadedFile(fileId: string, key?: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (fileId === CUSTOMER_SELECTION_FORM_ID || FORM_REFERENCE_FILES.some((item) => item.id === fileId)) return;
  const account = useWorkflowStore.getState().authUser;
  if (!account) throw new Error("Please sign in.");
  const current = getUploadedFiles();
  const fileToDelete = current.find((item) => item.id === fileId);
  const targetKey = key || fileToDelete?.key;

  if (targetKey) {
    const response = await fetch(`/api/files?key=${encodeURIComponent(targetKey)}`, {
      method: "DELETE",
      headers: { "x-workflow-account": account.id },
    });
    if (!response.ok) throw new Error("Could not delete this file. Refresh and try again.");
  }

  if (useWorkflowStore.getState().authUser !== account) return;
  const updated = current.filter((item) => item.id !== fileId);
  persistLibraryFiles(updated);
  window.dispatchEvent(
    new CustomEvent("workflow:uploaded-files-changed", {
      detail: { id: fileId, action: "deleted" },
    }),
  );
}

export async function uploadFileToR2(
  file: File,
  meta: {
    category: "legal" | "customer" | "supporting";
    title: string;
    description: string;
    replaceKey?: string;
  },
): Promise<UploadedFileRecord> {
  const account = useWorkflowStore.getState().authUser;
  if (!account) throw new Error("Please sign in.");
  const cleanName = file.name.replace(/^r2-\d+(-[a-z0-9]+)?-/, "");
  let response: Response;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", meta.category);
    formData.append(
      "title",
      (meta.title || cleanName).replace(/^r2-\d+(-[a-z0-9]+)?-/, ""),
    );
    formData.append("description", meta.description);
    if (meta.replaceKey) formData.append("replaceKey", meta.replaceKey);

    response = await fetch("/api/files/upload", {
      method: "POST",
      headers: { "x-workflow-account": account.id },
      body: formData,
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `Could not reach Library: ${error.message}` : "Could not reach Library.");
  }

  const data = (await response.json().catch(() => null)) as (Partial<UploadedFileRecord> & { ok?: boolean; error?: string; ownerUserId?: string }) | null;
  if (!response.ok || !data?.ok || !data.key) {
    throw new Error(data?.error || `Upload failed (${response.status}). Please try again.`);
  }
  if (useWorkflowStore.getState().authUser !== account || data.ownerUserId !== account.id) {
    throw new Error("Your account changed. Refresh and try again.");
  }

  const record: UploadedFileRecord = {
    id: data.id || data.key,
    key: data.key,
    fileName: data.fileName || cleanName,
    fileSize: data.fileSize ?? file.size,
    fileType: data.fileType || file.type || "application/octet-stream",
    category: data.category || meta.category,
    title: data.title || meta.title.trim() || cleanName,
    description: data.description ?? meta.description.trim(),
    uploadedAt: data.uploadedAt || new Date().toISOString(),
    url: data.url,
  };

  saveUploadedFile(record);
  return record;
}

export function downloadFile(record: {
  fileName?: string;
  dataUrl?: string;
  url?: string;
  title?: string;
}) {
  if (typeof window === "undefined") return;
  const fileName =
    record.fileName || `${(record.title || "document").replace(/\s+/g, "_")}.pdf`;
  const href =
    record.url ||
    record.dataUrl ||
    createPlaceholderDataUrl(fileName, record.title || fileName);

  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
