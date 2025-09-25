const UUID_HEX_REGEX = /^[0-9a-f]{32}$/;

function normalizeUuid(uuid) {
  if (typeof uuid !== "string") {
    throw new TypeError("UUID must be a string");
  }
  const cleaned = uuid.trim().toLowerCase().replace(/-/g, "");
  if (!UUID_HEX_REGEX.test(cleaned)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return cleaned;
}

export function uuidToHex32(uuid) {
  return normalizeUuid(uuid);
}

export function uuidToBytes16Hex(uuid) {
  return `0x${normalizeUuid(uuid)}`;
}
