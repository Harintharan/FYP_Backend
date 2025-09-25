export function stableStringify(value) {
  return stringifyValue(value);
}

function stringifyValue(input) {
  if (input === null) {
    return "null";
  }

  const type = typeof input;
  if (type === "number" || type === "boolean") {
    return JSON.stringify(input);
  }

  if (type === "string") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    const items = input.map((item) => stringifyValue(item)).join(",");
    return `[${items}]`;
  }

  if (type === "object") {
    const keys = Object.keys(input).sort();
    const entries = keys
      .map((key) => `${JSON.stringify(key)}:${stringifyValue(input[key])}`)
      .join(",");
    return `{${entries}}`;
  }

  throw new TypeError("Unsupported data type in canonicalization");
}
