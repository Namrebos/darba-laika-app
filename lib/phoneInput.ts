const supportedCallingCodes = [
  "371", "370", "372", "358", "353", "46", "47", "45", "48",
  "49", "44", "31", "32", "33", "34", "39",
].sort((first, second) => second.length - first.length);

export function normalizeInternationalPhoneInput(
  value: string,
  defaultCallingCode = "+371",
) {
  const trimmed = value.trim();
  let digits = value.replace(/\D/g, "");

  if (!digits) return defaultCallingCode;
  if (trimmed.startsWith("00")) {
    return `+${digits.slice(2, 15)}`;
  }
  if (trimmed.startsWith("+")) {
    return `+${digits.slice(0, 15)}`;
  }

  const pastedCallingCode = supportedCallingCodes.find(
    (code) => digits.startsWith(code) && digits.length > 8,
  );
  if (pastedCallingCode) return `+${digits.slice(0, 15)}`;

  const defaultDigits = defaultCallingCode.replace(/\D/g, "");
  if (digits.startsWith(defaultDigits)) return `+${digits.slice(0, 15)}`;

  return `${defaultCallingCode}${digits}`.slice(0, 16);
}
