import nodemailer from "nodemailer";

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export const EMAIL_TEST_MODE = !transporter;

export async function sendEmail(to: string, subject: string, html: string) {
  if (EMAIL_TEST_MODE) {
    console.log(`[EMAIL TEST] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL TEST] Body preview: ${html.replace(/<[^>]+>/g, " ").substring(0, 200)}`);
    return { messageId: `test_${Date.now()}` };
  }
  return transporter!.sendMail({
    from: '"HomeDirectAI" <noreply@homedirectai.com>',
    to,
    subject,
    html,
  });
}

// ── Email Templates ──────────────────────────────────────────────────────────

export async function sendNewOfferEmail(
  sellerEmail: string,
  sellerName: string,
  buyerName: string,
  amount: number,
  address: string
) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
  return sendEmail(
    sellerEmail,
    "New Offer on Your Property",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a7a4a">You've received an offer!</h2>
      <p>Hi ${sellerName},</p>
      <p><strong>${buyerName}</strong> has offered <strong>${formatted}</strong> on your property at <strong>${address}</strong>.</p>
      <p>Log in to your HomeDirectAI dashboard to review and respond.</p>
      <a href="${process.env.APP_URL || "https://homedirectai.com"}/#/dashboard" 
         style="background:#1a7a4a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
        View Offer
      </a>
    </div>
    `
  );
}

export async function sendOfferStatusEmail(
  buyerEmail: string,
  buyerName: string,
  status: string,
  address: string,
  amount: number,
  counterAmount?: number
) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);

  const statusMessages: Record<string, string> = {
    accepted: `Great news! Your offer of ${formatted} on ${address} has been <strong>accepted</strong>!`,
    rejected: `Your offer of ${formatted} on ${address} was <strong>declined</strong> by the seller.`,
    countered: `The seller has made a counter-offer of ${counterAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(counterAmount) : "a new amount"} on your offer for ${address}.`,
  };

  const message = statusMessages[status] || `Your offer status has been updated to: ${status}`;

  return sendEmail(
    buyerEmail,
    `Offer Update: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a7a4a">Offer Update</h2>
      <p>Hi ${buyerName},</p>
      <p>${message}</p>
      <p>Log in to your dashboard to take action.</p>
      <a href="${process.env.APP_URL || "https://homedirectai.com"}/#/dashboard"
         style="background:#1a7a4a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
        View Dashboard
      </a>
    </div>
    `
  );
}

export async function sendWalkthroughScheduledEmail(
  sellerEmail: string,
  sellerName: string,
  buyerName: string,
  address: string,
  date: string,
  time: string
) {
  return sendEmail(
    sellerEmail,
    "Walkthrough Scheduled at Your Property",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a7a4a">Walkthrough Requested</h2>
      <p>Hi ${sellerName},</p>
      <p><strong>${buyerName}</strong> has scheduled a walkthrough of your property at <strong>${address}</strong>.</p>
      <p><strong>Date:</strong> ${date}<br><strong>Time:</strong> ${time}</p>
      <p>A HomeDirectAI chaperone will accompany the buyer. No action required on your part.</p>
    </div>
    `
  );
}

export async function sendWalkthroughAssignedEmail(
  buyerEmail: string,
  buyerName: string,
  chaperoneName: string,
  address: string,
  date: string,
  time: string
) {
  return sendEmail(
    buyerEmail,
    "Chaperone Assigned to Your Walkthrough",
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a7a4a">Your Chaperone is Confirmed!</h2>
      <p>Hi ${buyerName},</p>
      <p><strong>${chaperoneName}</strong> has been assigned to guide your walkthrough of <strong>${address}</strong>.</p>
      <p><strong>Date:</strong> ${date}<br><strong>Time:</strong> ${time}</p>
      <p>They will meet you at the property entrance.</p>
    </div>
    `
  );
}

export async function sendTransactionStepEmail(
  email: string,
  name: string,
  stepName: string,
  status: string,
  address: string
) {
  return sendEmail(
    email,
    `Transaction Update: ${stepName} ${status}`,
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a7a4a">Transaction Update</h2>
      <p>Hi ${name},</p>
      <p>A transaction step has been updated for <strong>${address}</strong>:</p>
      <p><strong>${stepName}:</strong> ${status}</p>
      <a href="${process.env.APP_URL || "https://homedirectai.com"}/#/dashboard"
         style="background:#1a7a4a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
        View Transaction
      </a>
    </div>
    `
  );
}

export async function sendDocumentReadyEmail(
  email: string,
  name: string,
  docName: string,
  address: string
) {
  return sendEmail(
    email,
    `Document Ready: ${docName}`,
    `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#1a7a4a">Document Ready for Review</h2>
      <p>Hi ${name},</p>
      <p>A new document is ready for your review regarding <strong>${address}</strong>:</p>
      <p><strong>${docName}</strong></p>
      <a href="${process.env.APP_URL || "https://homedirectai.com"}/#/dashboard"
         style="background:#1a7a4a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">
        Review Document
      </a>
    </div>
    `
  );
}
