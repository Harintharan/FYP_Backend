const UUID_HEX_REGEX = /^[0-9a-f]{32}$/;
const UUID_GROUP_SIZES = [8, 4, 4, 4, 12];

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

export function bytes16HexToUuid(bytes16) {
  if (typeof bytes16 !== "string") {
    throw new TypeError("bytes16 value must be a string");
  }
  const trimmed = bytes16.trim().toLowerCase();
  const withoutPrefix = trimmed.startsWith("0x")
    ? trimmed.slice(2)
    : trimmed;

  if (!UUID_HEX_REGEX.test(withoutPrefix)) {
    throw new Error(`Invalid bytes16 UUID representation: ${bytes16}`);
  }

  let index = 0;
  const segments = UUID_GROUP_SIZES.map((size) => {
    const part = withoutPrefix.slice(index, index + size);
    index += size;
    return part;
  });

  return segments.join("-");
}
