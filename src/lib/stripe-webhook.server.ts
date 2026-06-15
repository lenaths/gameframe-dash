import "@tanstack/react-start/server-only";

import type Stripe from "stripe";

type SupabaseAny = {
  from: (table: string) => SupabaseQuery;
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  single: () => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
  insert: (values: Record<string, unknown>) => SupabaseQuery<T>;
  update: (values: Record<string, unknown>) => SupabaseQuery<T>;
};

type OrderRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  total_cents: number;
  currency: string;
};

export async function handleStripeWebhookRequest(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    const { constructStripeEvent } = await import("@/lib/stripe.server");
    event = constructStripeEvent(payload, signature);
  } catch (error) {
    console.error("[Stripe] Invalid webhook signature", error);
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseAny;

  const { error: eventInsertError } = await db.from("stripe_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      return Response.json({ received: true, duplicate: true });
    }
    console.error("[Stripe] Failed to record event", eventInsertError);
    return Response.json({ error: "Could not record Stripe event." }, { status: 500 });
  }

  try {
    await handleStripeEvent(db, event);
    await db
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);
    return Response.json({ received: true });
  } catch (error) {
    console.error("[Stripe] Webhook processing failed", error);
    return Response.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}

async function handleStripeEvent(db: SupabaseAny, event: Stripe.Event) {
  const eventType = event.type as string;
  switch (eventType) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(db, event.data.object as Stripe.Checkout.Session);
      break;
    case "invoice.paid":
      await handleInvoicePaid(db, event.data.object as Stripe.Invoice, event.id);
      break;
    case "invoice.payment_succeeded":
    case "invoice.payment_paid":
      await handleInvoicePaid(db, event.data.object as Stripe.Invoice, event.id);
      break;
    case "invoice_payment.paid":
      await handleInvoicePaymentPaid(db, event.data.object as StripeInvoicePayment, event.id);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(db, event.data.object as Stripe.Invoice, event.id);
      break;
    case "charge.succeeded":
      await handleChargeSucceeded(db, event.data.object as Stripe.Charge);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(db, event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }
}

async function handleCheckoutCompleted(db: SupabaseAny, session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) throw new Error("Checkout session is missing order metadata.");

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  const update: Record<string, unknown> = {
    status: "paid",
    stripe_customer_id: customerId ?? null,
    stripe_checkout_session_id: session.id,
    stripe_subscription_id: subscriptionId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { getStripe } = await import("@/lib/stripe.server");
  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    Object.assign(update, subscriptionPeriodFields(subscription));
  }

  const { error } = await db.from("orders").update(update).eq("id", orderId);
  if (error) throw new Error(error.message);
}

async function handleInvoicePaid(db: SupabaseAny, invoice: Stripe.Invoice, eventId: string) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const order = await findOrderForInvoice(db, invoice);
  if (!order) {
    logUnlinkedInvoice(invoice, "paid invoice");
    return;
  }

  const now = new Date().toISOString();
  const amountPaid = invoice.amount_paid ?? invoice.total ?? order.total_cents;
  const currency = (invoice.currency ?? order.currency).toUpperCase();
  const invoiceId = invoice.id;

  let paymentId: string | null = null;
  const paymentIntentId = getInvoicePaymentIntentId(invoice);
  const chargeId = getInvoiceChargeId(invoice);

  if (paymentIntentId || invoiceId) {
    const existingPaymentResult = await db
      .from("payments")
      .select("id")
      .eq(
        paymentIntentId ? "stripe_payment_intent_id" : "stripe_invoice_id",
        paymentIntentId ?? invoiceId,
      )
      .maybeSingle();
    const existingPayment = existingPaymentResult.data as { id: string } | null;

    if (existingPayment?.id) {
      paymentId = existingPayment.id;
      const { error } = await db
        .from("payments")
        .update({
          status: "paid",
          amount_cents: amountPaid,
          currency,
          provider: "stripe",
          stripe_invoice_id: invoiceId,
          stripe_payment_intent_id: paymentIntentId,
          stripe_charge_id: chargeId,
          stripe_event_id: eventId,
          raw_provider_payload: invoice as unknown as Record<string, unknown>,
          paid_at: now,
          updated_at: now,
        })
        .eq("id", paymentId);
      if (error) {
        logSupabaseWriteError("payments.update.paid", error, {
          paymentId,
          invoiceId,
          paymentIntentId,
          chargeId,
          orderId: order.id,
          eventId,
        });
        throw new Error(error.message);
      }
    } else {
      const paymentResult = await db
        .from("payments")
        .insert({
          user_id: order.user_id,
          order_id: order.id,
          provider: "stripe",
          provider_payment_id: paymentIntentId ?? invoiceId,
          status: "paid",
          currency,
          amount_cents: amountPaid,
          stripe_invoice_id: invoiceId,
          stripe_payment_intent_id: paymentIntentId,
          stripe_charge_id: chargeId,
          stripe_event_id: eventId,
          raw_provider_payload: invoice as unknown as Record<string, unknown>,
          paid_at: now,
        })
        .select("id")
        .single();
      const payment = paymentResult.data as { id: string } | null;
      if (paymentResult.error || !payment) {
        logSupabaseWriteError("payments.insert.paid", paymentResult.error, {
          invoiceId,
          paymentIntentId,
          chargeId,
          orderId: order.id,
          userId: order.user_id,
          eventId,
          amountPaid,
          currency,
        });
        throw new Error(paymentResult.error?.message ?? "Could not create payment.");
      }
      paymentId = payment.id;
    }
  }

  const invoiceNumber = invoice.number ?? `stripe-${invoiceId}`;
  const existingInvoiceResult = await db
    .from("invoices")
    .select("id")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle();
  const existingInvoice = existingInvoiceResult.data as { id: string } | null;

  const invoicePayload = {
    user_id: order.user_id,
    order_id: order.id,
    payment_id: paymentId,
    invoice_number: invoiceNumber,
    status: "paid",
    currency,
    subtotal_cents: invoice.subtotal ?? amountPaid,
    tax_cents: invoiceTaxAmount(invoice),
    total_cents: invoice.total ?? amountPaid,
    due_at: timestampToIso(invoice.due_date),
    paid_at: timestampToIso(invoice.status_transitions?.paid_at) ?? now,
    stripe_invoice_id: invoiceId,
    stripe_hosted_invoice_url: invoice.hosted_invoice_url,
    stripe_invoice_pdf: invoice.invoice_pdf,
    period_start: timestampToIso(invoice.period_start),
    period_end: timestampToIso(invoice.period_end),
    billing_snapshot: invoice as unknown as Record<string, unknown>,
    updated_at: now,
  };

  if (existingInvoice?.id) {
    const { error } = await db.from("invoices").update(invoicePayload).eq("id", existingInvoice.id);
    if (error) {
      logSupabaseWriteError("invoices.update.paid", error, {
        invoiceId,
        existingInvoiceId: existingInvoice.id,
        orderId: order.id,
        paymentId,
      });
      throw new Error(error.message);
    }
  } else {
    const { error } = await db.from("invoices").insert(invoicePayload);
    if (error) {
      logSupabaseWriteError("invoices.insert.paid", error, {
        invoiceId,
        invoiceNumber,
        orderId: order.id,
        userId: order.user_id,
        paymentId,
        totalCents: invoicePayload.total_cents,
      });
      throw new Error(error.message);
    }
  }

  const orderUpdate: Record<string, unknown> = {
    status: "paid",
    stripe_subscription_id: subscriptionId,
    current_period_start: timestampToIso(invoice.period_start),
    current_period_end: timestampToIso(invoice.period_end),
    renews_at: timestampToIso(invoice.period_end),
    updated_at: now,
  };

  const { error: orderError } = await db.from("orders").update(orderUpdate).eq("id", order.id);
  if (orderError) throw new Error(orderError.message);

  try {
    const { provisionPaidOrder } = await import("@/lib/provisioning.server");
    const result = await provisionPaidOrder(order.id);
    if (!result.ok) {
      console.error(
        `[Stripe] Provisioning failed after paid invoice ${invoiceId} for order=${order.id}: ${result.error}`,
      );
    } else {
      console.info(
        `[Stripe] Provisioning completed after paid invoice ${invoiceId} for order=${order.id}`,
      );
    }
  } catch (error) {
    console.error(
      `[Stripe] Provisioning threw after paid invoice ${invoiceId} for order=${order.id}`,
      error,
    );
  }
}

async function handleInvoicePaymentFailed(
  db: SupabaseAny,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  const order = await findOrderForInvoice(db, invoice);
  if (!order) {
    logUnlinkedInvoice(invoice, "failed invoice");
    return;
  }

  const now = new Date().toISOString();
  const invoiceId = invoice.id;
  const amountDue = invoice.amount_due ?? invoice.total ?? order.total_cents;
  const currency = (invoice.currency ?? order.currency).toUpperCase();

  const { error: paymentError } = await db.from("payments").insert({
    user_id: order.user_id,
    order_id: order.id,
    provider: "stripe",
    provider_payment_id: getInvoicePaymentIntentId(invoice) ?? invoiceId,
    status: "failed",
    currency,
    amount_cents: amountDue,
    stripe_invoice_id: invoiceId,
    stripe_payment_intent_id: getInvoicePaymentIntentId(invoice),
    stripe_event_id: eventId,
    raw_provider_payload: invoice as unknown as Record<string, unknown>,
    failed_at: now,
  });
  if (paymentError && paymentError.code !== "23505") {
    logSupabaseWriteError("payments.insert.failed", paymentError, {
      invoiceId,
      orderId: order.id,
      userId: order.user_id,
      eventId,
      amountDue,
      currency,
    });
    throw new Error(paymentError.message);
  }

  const existingInvoiceResult = await db
    .from("invoices")
    .select("id")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle();
  const existingInvoice = existingInvoiceResult.data as { id: string } | null;

  const invoicePayload = {
    user_id: order.user_id,
    order_id: order.id,
    invoice_number: invoice.number ?? `stripe-${invoiceId}`,
    status: "open",
    currency,
    subtotal_cents: invoice.subtotal ?? amountDue,
    tax_cents: invoiceTaxAmount(invoice),
    total_cents: invoice.total ?? amountDue,
    due_at: timestampToIso(invoice.due_date),
    stripe_invoice_id: invoiceId,
    stripe_hosted_invoice_url: invoice.hosted_invoice_url,
    stripe_invoice_pdf: invoice.invoice_pdf,
    period_start: timestampToIso(invoice.period_start),
    period_end: timestampToIso(invoice.period_end),
    billing_snapshot: invoice as unknown as Record<string, unknown>,
    updated_at: now,
  };

  if (existingInvoice?.id) {
    const { error } = await db.from("invoices").update(invoicePayload).eq("id", existingInvoice.id);
    if (error) {
      logSupabaseWriteError("invoices.update.failed", error, {
        invoiceId,
        existingInvoiceId: existingInvoice.id,
        orderId: order.id,
      });
      throw new Error(error.message);
    }
  } else {
    const { error } = await db.from("invoices").insert(invoicePayload);
    if (error) {
      logSupabaseWriteError("invoices.insert.failed", error, {
        invoiceId,
        orderId: order.id,
        userId: order.user_id,
        totalCents: invoicePayload.total_cents,
      });
      throw new Error(error.message);
    }
  }

  const { error: orderError } = await db
    .from("orders")
    .update({ status: "suspended", updated_at: now })
    .eq("id", order.id);
  if (orderError) throw new Error(orderError.message);
}

type StripeInvoicePayment = {
  id: string;
  invoice?: string | Stripe.Invoice | null;
  payment?: {
    type?: string;
    payment_intent?: string | Stripe.PaymentIntent | null;
  } | null;
};

async function handleInvoicePaymentPaid(
  db: SupabaseAny,
  invoicePayment: StripeInvoicePayment,
  eventId: string,
) {
  const invoiceId =
    typeof invoicePayment.invoice === "string"
      ? invoicePayment.invoice
      : (invoicePayment.invoice?.id ?? null);

  if (!invoiceId) {
    console.warn(`[Stripe] invoice_payment.paid ${invoicePayment.id} has no invoice link.`);
    return;
  }

  const { getStripe } = await import("@/lib/stripe.server");
  const invoice = await getStripe().invoices.retrieve(invoiceId);
  await handleInvoicePaid(db, invoice, eventId);
}

async function handleChargeSucceeded(db: SupabaseAny, charge: Stripe.Charge) {
  const chargeId = charge.id;
  const paymentIntentId = getChargePaymentIntentId(charge);
  const invoiceId = getChargeInvoiceId(charge);

  if (!paymentIntentId && !invoiceId) {
    console.warn(`[Stripe] charge.succeeded ${chargeId} has no payment_intent or invoice link.`);
    return;
  }

  const existingPaymentResult = await db
    .from("payments")
    .select("id")
    .eq(
      paymentIntentId ? "stripe_payment_intent_id" : "stripe_invoice_id",
      paymentIntentId ?? invoiceId,
    )
    .maybeSingle();
  const existingPayment = existingPaymentResult.data as { id: string } | null;

  if (!existingPayment?.id) {
    console.warn(
      `[Stripe] charge.succeeded ${chargeId} could not be linked to an existing payment. payment_intent=${paymentIntentId ?? "none"} invoice=${invoiceId ?? "none"}`,
    );
    return;
  }

  const { error } = await db
    .from("payments")
    .update({
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      provider_payment_id: paymentIntentId ?? chargeId,
      raw_provider_payload: charge as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingPayment.id);
  if (error) {
    logSupabaseWriteError("payments.update.charge_succeeded", error, {
      paymentId: existingPayment.id,
      chargeId,
      paymentIntentId,
      invoiceId,
    });
    throw new Error(error.message);
  }
}

async function handleSubscriptionDeleted(db: SupabaseAny, subscription: Stripe.Subscription) {
  const orderId = subscription.metadata?.order_id;
  let query = db.from("orders").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  });

  query = orderId ? query.eq("id", orderId) : query.eq("stripe_subscription_id", subscription.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

async function findOrderForInvoice(db: SupabaseAny, invoice: Stripe.Invoice) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const orderId = getInvoiceOrderId(invoice);

  if (orderId) {
    const orderResult = await db
      .from("orders")
      .select("id, user_id, plan_id, total_cents, currency")
      .eq("id", orderId)
      .maybeSingle();
    const order = orderResult.data as OrderRow | null;
    if (order) return order;
  }

  if (!subscriptionId) return null;

  const orderResult = await db
    .from("orders")
    .select("id, user_id, plan_id, total_cents, currency")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  return (orderResult.data as OrderRow | null) ?? null;
}

function getInvoiceOrderId(invoice: Stripe.Invoice) {
  return invoice.metadata?.order_id ?? getInvoiceParentMetadata(invoice).order_id ?? null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
  };
  const subscription = invoiceWithSubscription.subscription;
  if (typeof subscription === "string") return subscription;
  if (subscription?.id) return subscription.id;

  const parentSubscription = invoiceWithSubscription.parent?.subscription_details?.subscription;
  return typeof parentSubscription === "string"
    ? parentSubscription
    : (parentSubscription?.id ?? null);
}

function getInvoiceParentMetadata(invoice: Stripe.Invoice) {
  const invoiceWithParent = invoice as Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        metadata?: Record<string, string> | null;
      } | null;
    } | null;
  };

  return invoiceWithParent.parent?.subscription_details?.metadata ?? {};
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice) {
  const invoiceWithPaymentIntent = invoice as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent | null;
  };
  const paymentIntent = invoiceWithPaymentIntent.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null);
}

function getInvoiceChargeId(invoice: Stripe.Invoice) {
  const invoiceWithCharge = invoice as Stripe.Invoice & {
    charge?: string | Stripe.Charge | null;
  };
  const charge = invoiceWithCharge.charge;
  return typeof charge === "string" ? charge : (charge?.id ?? null);
}

function getChargePaymentIntentId(charge: Stripe.Charge) {
  const paymentIntent = charge.payment_intent;
  return typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null);
}

function getChargeInvoiceId(charge: Stripe.Charge) {
  const chargeWithInvoice = charge as Stripe.Charge & {
    invoice?: string | Stripe.Invoice | null;
  };
  const invoice = chargeWithInvoice.invoice;
  return typeof invoice === "string" ? invoice : (invoice?.id ?? null);
}

function invoiceTaxAmount(invoice: Stripe.Invoice) {
  const invoiceWithTax = invoice as Stripe.Invoice & { tax?: number | null };
  return invoiceWithTax.tax ?? 0;
}

function subscriptionPeriodFields(subscription: Stripe.Subscription) {
  const subscriptionWithPeriods = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
    trial_end?: number | null;
  };

  return {
    current_period_start: timestampToIso(subscriptionWithPeriods.current_period_start),
    current_period_end: timestampToIso(subscriptionWithPeriods.current_period_end),
    trial_end: timestampToIso(subscriptionWithPeriods.trial_end),
    renews_at: timestampToIso(subscriptionWithPeriods.current_period_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  };
}

function timestampToIso(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function logUnlinkedInvoice(invoice: Stripe.Invoice, context: string) {
  console.warn(
    [
      `[Stripe] Unable to link ${context} ${invoice.id} to an order.`,
      `metadata.order_id=${invoice.metadata?.order_id ?? "none"}`,
      `parent.metadata.order_id=${getInvoiceParentMetadata(invoice).order_id ?? "none"}`,
      `subscription=${getInvoiceSubscriptionId(invoice) ?? "none"}`,
      `customer=${typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? "none")}`,
    ].join(" "),
  );
}

function logSupabaseWriteError(
  operation: string,
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  context: Record<string, unknown>,
) {
  console.error(
    `[Stripe] Supabase ${operation} failed`,
    JSON.stringify(
      {
        error: error
          ? {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            }
          : null,
        context,
      },
      null,
      2,
    ),
  );
}
