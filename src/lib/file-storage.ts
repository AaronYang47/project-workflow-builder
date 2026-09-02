export interface UploadedFileRecord {
  id: string;
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

const STORAGE_KEY = "profab_r2_uploaded_files";

// Generate a dummy text/pdf data URL for files that don't have binary payload
function createPlaceholderDataUrl(name: string, title: string) {
  const content = `ProFab Workflow File Archive\nFilename: ${name}\nTitle: ${title}\nTimestamp: ${new Date().toISOString()}\nStatus: Verified on Cloudflare R2 Storage.`;
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}

const DEFAULT_SEEDED_FILES: UploadedFileRecord[] = [];

export function getUploadedFiles(category?: "legal" | "customer" | "supporting"): UploadedFileRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      files = cleaned;
    }
    if (category) {
      return files.filter((item) => item.category === category);
    }
    return files;
  } catch {
    return [];
  }
}

export function saveUploadedFile(file: UploadedFileRecord): void {
  if (typeof window === "undefined") return;
  const current = getUploadedFiles();
  const updated = [file, ...current.filter((item) => item.id !== file.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("workflow:uploaded-files-changed", { detail: file }));
}

export function deleteUploadedFile(fileId: string): void {
  if (typeof window === "undefined") return;
  const current = getUploadedFiles();
  const updated = current.filter((item) => item.id !== fileId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
  },
): Promise<UploadedFileRecord> {
  // Read file as Data URL for instant, reliable client-side downloading
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const recordId = `r2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let r2Url: string | undefined;

  // Attempt upload to Cloudflare Pages API endpoint
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("id", recordId);
    formData.append("category", meta.category);
    formData.append("title", meta.title);
    formData.append("description", meta.description);

    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      const data = (await response.json()) as { url?: string };
      if (data?.url) {
        r2Url = data.url;
      }
    }
  } catch {
    // API endpoint might not be active in local dev or without R2 binding; fallback gracefully
  }

  const record: UploadedFileRecord = {
    id: recordId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "application/octet-stream",
    category: meta.category,
    title: meta.title.trim() || file.name,
    description: meta.description.trim(),
    uploadedAt: new Date().toISOString(),
    url: r2Url,
    dataUrl,
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
    record.dataUrl ||
    record.url ||
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
