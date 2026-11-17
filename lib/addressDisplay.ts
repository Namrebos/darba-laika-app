export function shortAddress(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^LV-\d{4}$/i.test(part))
    .filter((part) => !/^(Latvija|Latvia)$/i.test(part))
    .join(", ");
}
