import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// Test endpoint to verify email configuration
// DELETE THIS IN PRODUCTION
export async function GET(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const authUrl = process.env.AUTH_URL;

  // Get email from query params
  const { searchParams } = new URL(request.url);
  const testEmail = searchParams.get("email");

  const diagnostics = {
    apiKeyPresent: !!apiKey,
    apiKeyPrefix: apiKey?.substring(0, 10) || "NOT SET",
    authUrl: authUrl || "NOT SET",
    fromEmail: process.env.EMAIL_FROM || "Amigo <noreply@send.amigo.slendyzo.pt>",
    testEmail: testEmail || "not provided",
    timestamp: new Date().toISOString(),
  };

  console.log("[Test Email] Diagnostics:", diagnostics);

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "RESEND_API_KEY not configured",
      diagnostics,
    });
  }

  if (!testEmail) {
    return NextResponse.json({
      success: false,
      error: "Provide ?email=your@email.com to send a test email",
      diagnostics,
    });
  }

  try {
    const resend = new Resend(apiKey);
    const fromEmail = process.env.EMAIL_FROM || "Amigo <noreply@send.amigo.slendyzo.pt>";

    console.log("[Test Email] Sending test email to:", testEmail);

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: testEmail,
      subject: "Amigo Test Email",
      html: `
        <h1>Test Email from Amigo</h1>
        <p>If you received this email, your email configuration is working correctly!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
        <pre>${JSON.stringify(diagnostics, null, 2)}</pre>
      `,
      text: `Test Email from Amigo\n\nIf you received this email, your email configuration is working correctly!\n\nTimestamp: ${new Date().toISOString()}`,
    });

    if (error) {
      console.error("[Test Email] Error:", error);
      return NextResponse.json({
        success: false,
        error: error.message,
        errorDetails: error,
        diagnostics,
      });
    }

    console.log("[Test Email] Success! Email ID:", data?.id);
    return NextResponse.json({
      success: true,
      emailId: data?.id,
      diagnostics,
    });
  } catch (err) {
    console.error("[Test Email] Exception:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      diagnostics,
    });
  }
}
