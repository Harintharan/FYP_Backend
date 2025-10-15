export function normalizeHash(value) {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}
