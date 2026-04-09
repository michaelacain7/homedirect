/**
 * HomeDirectAI — DocuSign Integration Service
 * Handles envelope creation, embedded signing, webhook status updates.
 * 
 * Required env vars:
 *   DOCUSIGN_INTEGRATION_KEY   — OAuth integration key (client ID)
 *   DOCUSIGN_SECRET_KEY        — OAuth secret
 *   DOCUSIGN_ACCOUNT_ID        — DocuSign account ID
 *   DOCUSIGN_BASE_URL          — API base (demo: https://demo.docusign.net/restapi, prod: https://na4.docusign.net/restapi)
 *   DOCUSIGN_OAUTH_BASE        — OAuth base (demo: https://account-d.docusign.com, prod: https://account.docusign.com)
 *   DOCUSIGN_REDIRECT_URI      — OAuth callback URL
 *   DOCUSIGN_USER_ID           — Impersonation user ID (for JWT auth)
 *   DOCUSIGN_PRIVATE_KEY       — RSA private key (PEM, for JWT auth)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocuSignConfig {
  integrationKey: string;
  secretKey: string;
  accountId: string;
  baseUrl: string;
  oauthBase: string;
  redirectUri: string;
  userId: string;
  privateKey: string;
}

export interface SignerInfo {
  email: string;
  name: string;
  role: "buyer" | "seller" | "agent" | "notary";
  routingOrder?: number;
}

export interface EnvelopeDocument {
  documentId: string;
  name: string;
  fileUrl: string;        // Path to PDF on disk
  requiresSignature: boolean;
}

export interface EnvelopeResult {
  envelopeId: string;
  status: string;
  signingUrls: Record<string, string>;  // role -> signing URL
}

export interface EnvelopeStatus {
  envelopeId: string;
  status: "created" | "sent" | "delivered" | "signed" | "completed" | "declined" | "voided";
  signers: Array<{
    email: string;
    name: string;
    status: string;
    signedAt?: string;
  }>;
  documents: Array<{
    documentId: string;
    name: string;
    status: string;
  }>;
  completedAt?: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

function getConfig(): DocuSignConfig | null {
  if (!process.env.DOCUSIGN_INTEGRATION_KEY) return null;
  return {
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    secretKey: process.env.DOCUSIGN_SECRET_KEY || "",
    accountId: process.env.DOCUSIGN_ACCOUNT_ID || "",
    baseUrl: process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi",
    oauthBase: process.env.DOCUSIGN_OAUTH_BASE || "https://account-d.docusign.com",
    redirectUri: process.env.DOCUSIGN_REDIRECT_URI || "http://localhost:5000/api/docusign/callback",
    userId: process.env.DOCUSIGN_USER_ID || "",
    privateKey: (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  };
}

export function isDocuSignConfigured(): boolean {
  return getConfig() !== null;
}

// ── Access Token Management ──────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("DocuSign not configured");

  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  // JWT Grant flow (server-to-server, no user interaction needed)
  if (config.privateKey && config.userId) {
    return await getJWTToken(config);
  }

  // Authorization Code Grant fallback
  throw new Error("DocuSign JWT auth not configured. Set DOCUSIGN_USER_ID and DOCUSIGN_PRIVATE_KEY.");
}

async function getJWTToken(config: DocuSignConfig): Promise<string> {
  // Build JWT assertion
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: config.integrationKey,
    sub: config.userId,
    aud: config.oauthBase.replace("https://", ""),
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  })).toString("base64url");

  // Sign with RSA private key
  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(config.privateKey, "base64url");
  const assertion = `${header}.${payload}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch(`${config.oauthBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DocuSign JWT auth failed: ${res.status} ${err}`);
  }

  const data = await res.json() as any;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) };
  console.log("[DocuSign] JWT token obtained successfully");
  return data.access_token;
}

// ── API Helpers ──────────────────────────────────────────────────────────────

async function dsApi(method: string, path: string, body?: any): Promise<any> {
  const config = getConfig();
  if (!config) throw new Error("DocuSign not configured");
  const token = await getAccessToken();

  const url = `${config.baseUrl}/v2.1/accounts/${config.accountId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DocuSign API error: ${res.status} ${err}`);
  }

  return res.json();
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create an envelope with documents and signers, and return embedded signing URLs.
 */
export async function createEnvelope(
  documents: EnvelopeDocument[],
  signers: SignerInfo[],
  emailSubject: string,
  returnUrl: string,
): Promise<EnvelopeResult> {
  const config = getConfig();
  if (!config) throw new Error("DocuSign not configured");

  const fs = await import("fs");
  const path = await import("path");

  // Build document objects with base64 content
  const envelopeDocs = await Promise.all(documents.map(async (doc, i) => {
    const filePath = path.join(process.cwd(), doc.fileUrl.replace(/^\//, ""));
    let documentBase64 = "";
    if (fs.existsSync(filePath)) {
      documentBase64 = fs.readFileSync(filePath).toString("base64");
    }
    return {
      documentBase64,
      name: doc.name,
      fileExtension: "pdf",
      documentId: doc.documentId || String(i + 1),
    };
  }));

  // Build signer objects with sign-here tabs
  const envelopeSigners = signers.map((signer, i) => ({
    email: signer.email,
    name: signer.name,
    recipientId: String(i + 1),
    routingOrder: String(signer.routingOrder || i + 1),
    clientUserId: `${signer.role}_${signer.email}`, // For embedded signing
    tabs: {
      signHereTabs: documents.filter(d => d.requiresSignature).map((doc, j) => ({
        documentId: doc.documentId || String(j + 1),
        pageNumber: "1",
        xPosition: "72",
        yPosition: "700",
        anchorString: signer.role === "buyer" ? "(Buyer)" : "(Seller)",
        anchorUnits: "pixels",
        anchorXOffset: "-50",
        anchorYOffset: "20",
      })),
      dateSignedTabs: documents.filter(d => d.requiresSignature).map((doc, j) => ({
        documentId: doc.documentId || String(j + 1),
        pageNumber: "1",
        anchorString: "Date: ____________",
        anchorUnits: "pixels",
        anchorXOffset: "40",
        anchorYOffset: "0",
      })),
    },
  }));

  // Create the envelope
  const envelope = await dsApi("POST", "/envelopes", {
    emailSubject,
    documents: envelopeDocs,
    recipients: { signers: envelopeSigners },
    status: "sent", // Send immediately
  });

  console.log(`[DocuSign] Envelope created: ${envelope.envelopeId}`);

  // Get embedded signing URLs for each signer
  const signingUrls: Record<string, string> = {};
  for (const signer of envelopeSigners) {
    try {
      const viewResult = await dsApi("POST", `/envelopes/${envelope.envelopeId}/views/recipient`, {
        returnUrl,
        authenticationMethod: "none",
        email: signer.email,
        userName: signer.name,
        clientUserId: signer.clientUserId,
      });
      const role = signers.find(s => s.email === signer.email)?.role || "unknown";
      signingUrls[role] = viewResult.url;
    } catch (err) {
      console.error(`[DocuSign] Failed to get signing URL for ${signer.email}:`, err);
    }
  }

  return {
    envelopeId: envelope.envelopeId,
    status: envelope.status,
    signingUrls,
  };
}

/**
 * Get the status of an envelope and all its signers.
 */
export async function getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus> {
  const envelope = await dsApi("GET", `/envelopes/${envelopeId}`);
  const recipients = await dsApi("GET", `/envelopes/${envelopeId}/recipients`);

  return {
    envelopeId,
    status: envelope.status,
    signers: (recipients.signers || []).map((s: any) => ({
      email: s.email,
      name: s.name,
      status: s.status,
      signedAt: s.signedDateTime,
    })),
    documents: [], // Could fetch document list if needed
    completedAt: envelope.completedDateTime,
  };
}

/**
 * Download a signed document from an envelope.
 */
export async function downloadSignedDocument(
  envelopeId: string,
  documentId: string,
  outputPath: string,
): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("DocuSign not configured");
  const token = await getAccessToken();

  const url = `${config.baseUrl}/v2.1/accounts/${config.accountId}/envelopes/${envelopeId}/documents/${documentId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const fs = await import("fs");
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`[DocuSign] Downloaded signed document to ${outputPath}`);
  return outputPath;
}

/**
 * Void (cancel) an envelope that hasn't been completed.
 */
export async function voidEnvelope(envelopeId: string, reason: string): Promise<void> {
  await dsApi("PUT", `/envelopes/${envelopeId}`, {
    status: "voided",
    voidedReason: reason,
  });
  console.log(`[DocuSign] Envelope ${envelopeId} voided: ${reason}`);
}

/**
 * Generate a new embedded signing URL for a signer (e.g. if the previous one expired).
 */
export async function getSigningUrl(
  envelopeId: string,
  signerEmail: string,
  signerName: string,
  role: string,
  returnUrl: string,
): Promise<string> {
  const viewResult = await dsApi("POST", `/envelopes/${envelopeId}/views/recipient`, {
    returnUrl,
    authenticationMethod: "none",
    email: signerEmail,
    userName: signerName,
    clientUserId: `${role}_${signerEmail}`,
  });
  return viewResult.url;
}

// ── Fallback (when DocuSign is not configured) ───────────────────────────────

export function getFallbackSigningStatus(): EnvelopeStatus {
  return {
    envelopeId: "local",
    status: "created",
    signers: [],
    documents: [],
  };
}
