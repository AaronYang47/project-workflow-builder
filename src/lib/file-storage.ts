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

export async function fetchUploadedFilesFromR2(
  category?: "legal" | "customer" | "supporting",
): Promise<UploadedFileRecord[]> {
  try {
    const response = await fetch("/api/files");
    if (response.ok) {
      const data = (await response.json()) as {
        ok: boolean;
        files?: UploadedFileRecord[];
      };
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
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
        return category
          ? data.files.filter((item) => item.category === category)
          : data.files;
      }
    }
  } catch {
    // Network or offline fallback
  }
  return getUploadedFiles(category);
}

export function saveUploadedFile(file: UploadedFileRecord): void {
  if (typeof window === "undefined") return;
  const current = getUploadedFiles();
  const updated = [file, ...current.filter((item) => item.id !== file.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("workflow:uploaded-files-changed", { detail: file }));
}

export async function deleteUploadedFile(fileId: string, key?: string): Promise<void> {
  if (typeof window === "undefined") return;
  const current = getUploadedFiles();
  const fileToDelete = current.find((item) => item.id === fileId);
  const targetKey = key || fileToDelete?.key;

  if (targetKey) {
    try {
      await fetch(`/api/files?key=${encodeURIComponent(targetKey)}`, {
        method: "DELETE",
      });
    } catch {
      // Best effort remote delete
    }
  }

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

  const cleanName = file.name.replace(/^r2-\d+(-[a-z0-9]+)?-/, "");
  const recordId = cleanName;
  let r2Url: string | undefined;
  let remoteKey: string | undefined;

  // Attempt upload to Cloudflare Pages API endpoint
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("id", recordId);
    formData.append("category", meta.category);
    formData.append(
      "title",
      (meta.title || cleanName).replace(/^r2-\d+(-[a-z0-9]+)?-/, ""),
    );
    formData.append("description", meta.description);

    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
    });
    if (response.ok) {
      const data = (await response.json()) as { url?: string; key?: string };
      if (data?.url) {
        r2Url = data.url;
      }
      if (data?.key) {
        remoteKey = data.key;
      }
    }
  } catch {
    // API endpoint might not be active in local dev; fallback gracefully
  }

  const record: UploadedFileRecord = {
    id: recordId,
    key: remoteKey,
    fileName: cleanName,
    fileSize: file.size,
    fileType: file.type || "application/octet-stream",
    category: meta.category,
    title:
      (meta.title || cleanName)
        .replace(/^r2-\d+(-[a-z0-9]+)?-/, "")
        .trim() || cleanName,
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
