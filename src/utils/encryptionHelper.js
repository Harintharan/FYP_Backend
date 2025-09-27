const crypto = require("crypto");

const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // must be 32 bytes
const iv = Buffer.from(process.env.ENCRYPTION_IV, "hex");   // must be 16 bytes

// Encrypt text -> hex
function encrypt(text) {
  if (!text) return "";  // handle null/undefined
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}


// Decrypt hex -> text
function decrypt(encryptedText) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}



module.exports = { encrypt, decrypt };
