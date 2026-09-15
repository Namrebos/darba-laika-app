const legalFormPrefix = /^(?:sabiedrība\s+ar\s+ierobežotu\s+atbildību|akciju\s+sabiedrība|individuālais\s+komersants|zemnieku\s+saimniecība|zvejnieku\s+saimniecība|pilnsabiedrība|komandītsabiedrība|sia|as|ik|zs)\s*[,.\-–—:]?\s*/iu;
const legalFormSuffix = /\s*[,.\-–—:]?\s*(?:sia|as|ik|zs)\s*$/iu;

export function shortPartnerName(companyName: string) {
  const normalized = companyName.trim().replace(/\s+/g, " ");
  if (!normalized) return "";

  const quotedName = normalized.match(/["“”„«»]([^"“”„«»]+)["“”„«»]/u)?.[1]?.trim();
  if (quotedName) return quotedName;

  return normalized
    .replace(legalFormPrefix, "")
    .replace(legalFormSuffix, "")
    .replace(/^["“”„«»]|["“”„«»]$/gu, "")
    .trim() || normalized;
}
