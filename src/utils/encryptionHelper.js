import crypto from "node:crypto";

const keyHex = process.env.ENCRYPTION_KEY ?? "";
const ivHex = process.env.ENCRYPTION_IV ?? "";

function isHex(value) {
  return /^[0-9a-fA-F]+$/.test(value);
}

const isConfigured =
  keyHex.length === 64 &&
  ivHex.length === 32 &&
  isHex(keyHex) &&
  isHex(ivHex);

const key = isConfigured ? Buffer.from(keyHex, "hex") : null;
const iv = isConfigured ? Buffer.from(ivHex, "hex") : null;

let warned = false;

function ensureConfigured() {
  if (!isConfigured && !warned) {
    console.warn(
      "⚠️  Encryption keys missing or invalid. Falling back to plain text storage."
    );
    warned = true;
  }
  return isConfigured;
}

export function encrypt(text) {
  if (!text) return "";
  if (!ensureConfigured()) {
    return text;
  }
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decrypt(encryptedText) {
  if (!ensureConfigured()) {
    return encryptedText ?? "";
  }
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
