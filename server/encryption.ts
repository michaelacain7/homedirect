/**
 * HomeDirectAI — PII Encryption Service
 * 
 * Encrypts sensitive personal information (PII) at rest using AES-256-GCM.
 * The AI agent receives decrypted data in memory — never stores plaintext.
 * 
 * What gets encrypted:
 *   - Questionnaire responses (addresses, financial info, SSN-adjacent data)
 *   - Bank account numbers
 *   - SSN (already hashed with bcrypt, this adds envelope encryption)
 *   - Any user-submitted PII via forms
 * 
 * What does NOT get encrypted (already safe or needed for search):
 *   - Passwords (bcrypt hashed, one-way)
 *   - Email addresses (needed for login/lookup)
 *   - Property addresses (public record)
 *   - Names (needed for display)
 */

import crypto from "crypto";

// ── Config ───────────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive encryption key from environment secret.
 * Uses PBKDF2 with a fixed salt derived from the secret itself.
 * In production, ENCRYPTION_KEY should be a 64-char hex string.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || "homedirect-default-dev-key-change-in-production";
  
  if (secret.length === 64 && /^[0-9a-f]+$/i.test(secret)) {
    // Already a proper 256-bit hex key
    return Buffer.from(secret, "hex");
  }
  
  // Derive key from passphrase using PBKDF2
  const salt = crypto.createHash("sha256").update(secret + "-salt").digest();
  return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, "sha512");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt a string value. Returns base64-encoded ciphertext with IV and auth tag.
 * Format: base64(IV + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Pack: IV (16) + AuthTag (16) + Ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return `enc:${packed.toString("base64")}`;
}

/**
 * Decrypt a value. If the value isn't encrypted (no enc: prefix), returns as-is.
 * This makes it safe to call on both encrypted and plaintext values.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith("enc:")) return ciphertext; // Not encrypted, return as-is
  
  const key = getEncryptionKey();
  const packed = Buffer.from(ciphertext.slice(4), "base64");
  
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt a JSON object's values (one level deep).
 * Encrypts only string/number values, leaves structure intact.
 */
export function encryptObject(obj: Record<string, any>): Record<string, any> {
  const encrypted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key) && value !== null && value !== undefined) {
      encrypted[key] = encrypt(String(value));
    } else {
      encrypted[key] = value;
    }
  }
  return encrypted;
}

/**
 * Decrypt a JSON object's values (one level deep).
 * Only decrypts values with the enc: prefix.
 */
export function decryptObject(obj: Record<string, any>): Record<string, any> {
  const decrypted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.startsWith("enc:")) {
      decrypted[key] = decrypt(value);
    } else {
      decrypted[key] = value;
    }
  }
  return decrypted;
}

/**
 * Determine if a field name contains sensitive data that should be encrypted.
 */
function isSensitiveField(fieldName: string): boolean {
  const sensitivePatterns = [
    "ssn", "socialSecurity", "social_security",
    "bankAccount", "bank_account", "routingNumber", "routing_number",
    "accountNumber", "account_number",
    "driversLicense", "drivers_license", "licenseNumber", "license_number",
    "dateOfBirth", "date_of_birth", "dob",
    "mailingAddress", "mailing_address", "buyerAddress", "sellerAddress",
    "grantorAddress", "granteeAddress",
    "loanAmount", "interestRate", "monthlyPayment",
    "mortgagePayoff", "mortgage_payoff",
    "maritalStatus", "marital_status",
    "vestingType", "vesting_type",
    "lenderName",
  ];
  
  const lower = fieldName.toLowerCase();
  return sensitivePatterns.some(p => lower.includes(p.toLowerCase()));
}

/**
 * Mask a value for display (e.g., SSN → ***-**-1234).
 */
export function maskValue(value: string, type: "ssn" | "account" | "address" | "default" = "default"): string {
  if (!value) return "";
  
  switch (type) {
    case "ssn":
      return `***-**-${value.slice(-4)}`;
    case "account":
      return `****${value.slice(-4)}`;
    case "address": {
      const parts = value.split(",");
      if (parts.length > 1) return `${parts[0].trim().substring(0, 3)}***,${parts.slice(1).join(",")}`;
      return `${value.substring(0, 5)}***`;
    }
    default:
      if (value.length <= 4) return "****";
      return `${value.substring(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
  }
}

/**
 * Decrypt questionnaire responses for AI agent use.
 * Returns fully decrypted data — only call this server-side for document filling.
 */
export function decryptForAgent(encryptedResponses: string): Record<string, any> {
  try {
    const parsed = JSON.parse(encryptedResponses);
    return decryptObject(parsed);
  } catch {
    return {};
  }
}

/**
 * Prepare questionnaire responses for safe display to the user.
 * Sensitive fields are masked, non-sensitive shown as-is.
 */
export function prepareForDisplay(responses: Record<string, any>): Record<string, any> {
  const display: Record<string, any> = {};
  for (const [key, value] of Object.entries(responses)) {
    if (typeof value === "string" && value.startsWith("enc:")) {
      // Show masked version
      const decrypted = decrypt(value);
      display[key] = isSensitiveField(key) ? maskValue(decrypted) : decrypted;
    } else {
      display[key] = value;
    }
  }
  return display;
}

/**
 * Check if encryption is properly configured for production use.
 */
export function isEncryptionConfigured(): boolean {
  const key = process.env.ENCRYPTION_KEY;
  return !!key && key.length >= 32;
}
