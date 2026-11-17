const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

/** Escape text for HTML strings built by the PDF/print exporters. */
export function escapeHtml(value?: string | null): string {
  return value ? value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]) : "";
}
