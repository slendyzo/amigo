/** Exact name equivalence only: accents remain meaningful; Unicode spellings do not. */
export function normalizeReceiptPersonName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isPlaceholderReceiptName(name: string): boolean {
  const normalized = normalizeReceiptPersonName(name);
  return !normalized || /^(person|pessoa|personne)\s+\d+$/.test(normalized);
}
