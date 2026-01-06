import { Resend } from "resend";

// Use Resend's default domain until custom domain is verified
// To use custom domain: verify amigo.slendyzo.pt in Resend dashboard, then set EMAIL_FROM env var
const FROM_EMAIL = process.env.EMAIL_FROM || "VibeFinance <onboarding@resend.dev>";

// Lazy initialization to avoid build-time errors when API key is not set
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  const resetUrl = `${process.env.AUTH_URL || "http://localhost:3000"}/auth/reset-password?token=${token}`;

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Reset your VibeFinance password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">VibeFinance</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1f2937; margin-top: 0;">Reset your password</h2>
            <p>Hi${userName ? ` ${userName}` : ""},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;">${resetUrl}</a>
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
Reset your VibeFinance password

Hi${userName ? ` ${userName}` : ""},

We received a request to reset your password. Visit the link below to create a new password:

${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
      `.trim(),
    });

    if (error) {
      console.error("Failed to send password reset email:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Email sending error:", err);
    return { success: false, error: "Failed to send email" };
  }
}
