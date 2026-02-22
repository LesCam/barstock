const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export class EmailService {
  static async sendAlertEmail(
    to: string,
    title: string,
    body: string,
    linkUrl?: string
  ): Promise<void> {
    if (!RESEND_API_KEY) return; // Graceful dev fallback

    const ctaHtml = linkUrl
      ? `<p style="margin-top:20px"><a href="${linkUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View Details</a></p>`
      : "";

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a;margin-bottom:8px">${title}</h2>
        <p style="color:#4a4a4a;line-height:1.5">${body}</p>
        ${ctaHtml}
        <hr style="border:none;border-top:1px solid #e5e5e5;margin-top:32px" />
        <p style="color:#999;font-size:12px">Sent by BarStock Alerts</p>
      </div>
    `;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to,
          subject: title,
          html,
        }),
      });
    } catch {
      // Email delivery is best-effort — don't throw
    }
  }

  static async sendInviteEmail(
    to: string,
    businessName: string,
    inviterName: string,
    inviteUrl: string
  ): Promise<void> {
    if (!RESEND_API_KEY) {
      console.log(
        `\n[STAFF INVITE] Invite for ${to} to join ${businessName}:\n${inviteUrl}\n`
      );
      return;
    }

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a;margin-bottom:8px">You're invited to ${businessName}</h2>
        <p style="color:#4a4a4a;line-height:1.5">
          ${inviterName} has invited you to join <strong>${businessName}</strong> on BarStock.
          Click the button below to set up your account.
        </p>
        <p style="margin-top:20px">
          <a href="${inviteUrl}" style="background:#E9B44C;color:#0B1623;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Accept Invite
          </a>
        </p>
        <p style="color:#999;font-size:12px;margin-top:24px">
          This invite link expires in 48 hours.
        </p>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin-top:32px" />
        <p style="color:#999;font-size:12px">Sent by BarStock</p>
      </div>
    `;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to,
          subject: `You're invited to ${businessName}`,
          html,
        }),
      });
    } catch {
      // Email delivery is best-effort — don't throw
    }
  }
}
