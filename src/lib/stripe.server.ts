import "@tanstack/react-start/server-only";

import Stripe from "stripe";

type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
};

let stripeClient: Stripe | undefined;

function requireEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing server-only Stripe environment variable: ${name}`);
  }
  return value;
}

export function getStripeConfig(): StripeConfig {
  return {
    secretKey: requireEnv("STRIPE_SECRET_KEY"),
    webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET"),
    successUrl: requireEnv("STRIPE_SUCCESS_URL"),
    cancelUrl: requireEnv("STRIPE_CANCEL_URL"),
  };
}

export function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeConfig().secretKey);
  }
  return stripeClient;
}

export function constructStripeEvent(payload: string, signature: string | null) {
  if (!signature) throw new Error("Missing Stripe signature.");
  const { webhookSecret } = getStripeConfig();
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
}
