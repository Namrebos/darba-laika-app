export const countryCodes = [
  ["+371", "Latvija"], ["+370", "Lietuva"], ["+372", "Igaunija"],
  ["+358", "Somija"], ["+46", "Zviedrija"], ["+47", "Norvēģija"],
  ["+45", "Dānija"], ["+48", "Polija"], ["+49", "Vācija"],
  ["+44", "Apvienotā Karaliste"], ["+353", "Īrija"],
  ["+31", "Nīderlande"], ["+32", "Beļģija"], ["+33", "Francija"],
  ["+34", "Spānija"], ["+39", "Itālija"],
] as const;

const countryCodesByLength = [...countryCodes].sort(
  ([first], [second]) => second.length - first.length,
);

export function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function maxSubscriberDigits(code: string) {
  return code === "+371" ? 8 : 15 - phoneDigits(code).length;
}

export function normalizePhoneInput(value: string, currentCode = "+371") {
  const trimmed = value.trim();
  let digits = phoneDigits(value);
  const startsWithDoubleZero = trimmed.startsWith("00");
  if (startsWithDoubleZero) digits = digits.slice(2);

  const looksInternational = trimmed.startsWith("+") || startsWithDoubleZero ||
    digits.length > maxSubscriberDigits(currentCode);
  const matchedCode = looksInternational
    ? countryCodesByLength.find(([code]) => digits.startsWith(phoneDigits(code)))?.[0]
    : undefined;
  const code = matchedCode || currentCode;
  const subscriber = matchedCode
    ? digits.slice(phoneDigits(matchedCode).length)
    : digits;

  return { code, subscriber: subscriber.slice(0, maxSubscriberDigits(code)) };
}

export function isValidPhone(code: string, value: string) {
  const subscriber = phoneDigits(value);
  if (code === "+371") return /^\d{8}$/.test(subscriber);
  return /^\+[1-9]\d{7,14}$/.test(`${code}${subscriber}`);
}

export function normalizeInternationalPhoneInput(
  value: string,
  defaultCallingCode = "+371",
) {
  const normalized = normalizePhoneInput(value, defaultCallingCode);
  return `${normalized.code}${normalized.subscriber}`;
}

export function isValidInternationalPhone(value: unknown) {
  const compact = String(value ?? "").replace(/\D/g, "");
  if (compact.startsWith("371")) return /^371\d{8}$/.test(compact);
  return /^[1-9]\d{7,14}$/.test(compact);
}
