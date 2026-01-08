import { Resend } from "resend";

const FROM_EMAIL = process.env.EMAIL_FROM || "Amigo <noreply@amigo.slendyzo.pt>";

// Lazy initialization to avoid build-time errors when API key is not set
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    console.log("[Email] Initializing Resend client, API key present:", !!apiKey, "key prefix:", apiKey?.substring(0, 10));
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  userName?: string
): Promise<{ success: boolean; error?: string }> {
  const resetUrl = `${process.env.AUTH_URL || "http://localhost:3000"}/auth/reset-password?token=${token}`;

  console.log("[Email] Attempting to send password reset email to:", email);
  console.log("[Email] Reset URL:", resetUrl);
  console.log("[Email] FROM:", FROM_EMAIL);

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Reset your Amigo password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Amigo</h1>
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
Reset your Amigo password

Hi${userName ? ` ${userName}` : ""},

We received a request to reset your password. Visit the link below to create a new password:

${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
      `.trim(),
    });

    if (error) {
      console.error("[Email] Failed to send password reset email:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email] Successfully sent email, ID:", data?.id);
    return { success: true };
  } catch (err) {
    console.error("Email sending error:", err);
    return { success: false, error: "Failed to send email" };
  }
}

/**
 * Send workspace invitation email
 * @param email - Recipient email address
 * @param inviterName - Name of the person who sent the invitation
 * @param workspaceName - Name of the workspace being invited to
 * @param token - Unique invitation token
 * @param isNewUser - Whether the recipient needs to create an account
 */
export async function sendWorkspaceInvitationEmail(
  email: string,
  inviterName: string,
  workspaceName: string,
  token: string,
  isNewUser: boolean
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.AUTH_URL || "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invitations/${token}`;
  const signupUrl = `${baseUrl}/auth/signup?invite=${token}`;

  console.log("[Email] Sending workspace invitation to:", email);
  console.log("[Email] Workspace:", workspaceName, "Inviter:", inviterName);

  try {
    const resend = getResendClient();

    const subject = isNewUser
      ? `${inviterName} invited you to join Amigo`
      : `${inviterName} invited you to join "${workspaceName}"`;

    const actionUrl = isNewUser ? signupUrl : inviteUrl;
    const buttonText = isNewUser ? "Create Account & Join" : "Accept Invitation";

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Amigo</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #1f2937; margin-top: 0;">You're invited!</h2>
            <p><strong>${inviterName}</strong> has invited you to join the workspace <strong>"${workspaceName}"</strong> on Amigo.</p>
            ${isNewUser ? `
            <p>Amigo is a personal finance app that helps you track expenses, manage budgets, and share financial data with family or team members.</p>
            ` : ""}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">${buttonText}</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This invitation will expire in 7 days.</p>
            ${!isNewUser ? `
            <p style="color: #6b7280; font-size: 14px;">If you don't want to join this workspace, you can simply ignore this email.</p>
            ` : ""}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${actionUrl}" style="color: #3b82f6; word-break: break-all;">${actionUrl}</a>
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
You're invited to join "${workspaceName}" on Amigo!

${inviterName} has invited you to join the workspace "${workspaceName}".

${isNewUser ? "Amigo is a personal finance app that helps you track expenses, manage budgets, and share financial data with family or team members.\n\n" : ""}Click the link below to ${isNewUser ? "create your account and " : ""}accept the invitation:

${actionUrl}

This invitation will expire in 7 days.

${!isNewUser ? "If you don't want to join this workspace, you can simply ignore this email." : ""}
      `.trim(),
    });

    if (error) {
      console.error("[Email] Failed to send invitation email:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email] Successfully sent invitation email, ID:", data?.id);
    return { success: true };
  } catch (err) {
    console.error("[Email] Invitation email sending error:", err);
    return { success: false, error: "Failed to send email" };
  }
}
