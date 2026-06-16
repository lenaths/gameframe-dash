import "@tanstack/react-start/server-only";

type EmailTemplate = {
  to: string | null | undefined;
  subject: string;
  html: string;
  text: string;
};

type Money = {
  amountCents: number;
  currency: string;
};

function getEmailConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() ?? "",
    from: process.env.EMAIL_FROM?.trim() || "XNTServers <no-reply@xntservers.com>",
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money({ amountCents, currency }: Money) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amountCents / 100);
}

function layout(title: string, body: string) {
  return `
    <div style="margin:0;padding:24px;background:#050816;color:#e5e7eb;font-family:Inter,Arial,sans-serif">
      <div style="max-width:640px;margin:0 auto;border:1px solid rgba(0,191,255,.22);background:#0B1220;border-radius:14px;padding:28px">
        <div style="color:#00BFFF;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:12px">XNTServers</div>
        <h1 style="margin:12px 0 18px;font-size:26px;color:#fff">${escapeHtml(title)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#cbd5e1">${body}</div>
      </div>
    </div>
  `;
}

export async function sendTransactionalEmail(template: EmailTemplate) {
  const { apiKey, from } = getEmailConfig();
  if (!apiKey) {
    console.info("[Email] email disabled: RESEND_API_KEY is not configured.");
    return { ok: false as const, disabled: true as const };
  }
  if (!template.to) {
    console.warn("[Email] email skipped: missing recipient.");
    return { ok: false as const, disabled: false as const };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [template.to],
        subject: template.subject,
        html: template.html,
        text: template.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("[Email] Resend send failed", {
        status: response.status,
        statusText: response.statusText,
        body,
      });
      return { ok: false as const, disabled: false as const };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    console.info("[Email] sent", { to: template.to, subject: template.subject, id: body.id });
    return { ok: true as const, id: body.id ?? null };
  } catch (error) {
    console.warn("[Email] Resend send threw", { error: (error as Error).message });
    return { ok: false as const, disabled: false as const };
  }
}

export function paidInvoiceEmail(input: {
  to: string | null | undefined;
  amountCents: number;
  currency: string;
  invoiceNumber: string;
  hostedInvoiceUrl?: string | null;
}) {
  const amount = money(input);
  const invoiceNumber = escapeHtml(input.invoiceNumber);
  const link = input.hostedInvoiceUrl
    ? `<p><a href="${escapeHtml(input.hostedInvoiceUrl)}" style="color:#00BFFF">Voir la facture</a></p>`
    : "";
  return {
    to: input.to,
    subject: `Facture payée - ${invoiceNumber}`,
    html: layout(
      "Facture payée",
      `<p>Votre paiement de <strong>${escapeHtml(amount)}</strong> a bien été reçu.</p><p>Facture : <strong>${invoiceNumber}</strong></p>${link}`,
    ),
    text: `Votre paiement de ${amount} a bien été reçu.\nFacture : ${input.invoiceNumber}\n${input.hostedInvoiceUrl ?? ""}`,
  };
}

export function serverReadyEmail(input: {
  to: string | null | undefined;
  serverName: string;
  identifier?: string | null;
}) {
  return {
    to: input.to,
    subject: `Serveur prêt - ${input.serverName}`,
    html: layout(
      "Serveur prêt",
      `<p>Votre serveur <strong>${escapeHtml(input.serverName)}</strong> est prêt.</p><p>Vous pouvez retrouver ses informations de connexion dans votre dashboard XNTServers.</p>`,
    ),
    text: `Votre serveur ${input.serverName} est prêt.\nVous pouvez retrouver ses informations de connexion dans votre dashboard XNTServers.`,
  };
}

export function provisioningFailedEmail(input: {
  to: string | null | undefined;
  serverName: string;
  error: string;
}) {
  return {
    to: input.to,
    subject: `Préparation serveur échouée - ${input.serverName}`,
    html: layout(
      "Préparation serveur échouée",
      `<p>La préparation du serveur <strong>${escapeHtml(input.serverName)}</strong> a échoué.</p><p style="color:#fca5a5">${escapeHtml(input.error)}</p><p>Notre équipe peut relancer l'opération depuis l'administration.</p>`,
    ),
    text: `La préparation du serveur ${input.serverName} a échoué.\n${input.error}`,
  };
}

export function ticketRepliedEmail(input: {
  to: string | null | undefined;
  subject: string;
  replyPreview: string;
}) {
  return {
    to: input.to,
    subject: `Réponse support - ${input.subject}`,
    html: layout(
      "Votre ticket a reçu une réponse",
      `<p>Un membre de l'équipe a répondu à votre ticket <strong>${escapeHtml(input.subject)}</strong>.</p><p>${escapeHtml(input.replyPreview)}</p>`,
    ),
    text: `Un membre de l'équipe a répondu à votre ticket ${input.subject}.\n\n${input.replyPreview}`,
  };
}
