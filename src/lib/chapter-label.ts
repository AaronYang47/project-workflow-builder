/** Display the renamed Department label while preserving saved workflow field names. */
export function chapterLabel(value: string | undefined | null, fallback = "Department") {
  const label = value?.trim() || fallback;
  return label.replace(/^(?:stage|chapter)(?=\s|$)/i, "Department");
}
