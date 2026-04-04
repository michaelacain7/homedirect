import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export const TEST_MODE = !stripe;

export async function createPaymentIntent(amount: number, metadata: Record<string, string>) {
  if (TEST_MODE) {
    return {
      id: `pi_test_${Date.now()}`,
      client_secret: `test_secret_${Date.now()}`,
      status: "succeeded",
    };
  }
  return stripe!.paymentIntents.create({
    amount: Math.round(amount * 100), // cents
    currency: "usd",
    metadata,
  });
}

export async function createPayout(amount: number, destination: string) {
  if (TEST_MODE) {
    return { id: `po_test_${Date.now()}`, status: "paid" };
  }
  return stripe!.transfers.create({
    amount: Math.round(amount * 100),
    currency: "usd",
    destination,
  });
}
