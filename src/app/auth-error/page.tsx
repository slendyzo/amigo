"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  AuthShell,
  PrimaryButton,
  SurfaceButton,
  StatusIcon,
} from "../signin/auth-ui";

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration. Check if AUTH_URL and OAuth credentials are set correctly.",
    AccessDenied: "Access was denied. You may have cancelled the sign-in or don't have permission.",
    Verification: "The verification link has expired or has already been used.",
    OAuthSignin: "Error starting the OAuth sign-in flow. Check your Google OAuth configuration.",
    OAuthCallback: "Error in the OAuth callback. Make sure the callback URL is correctly configured in Google Cloud Console.",
    OAuthCreateAccount: "Could not create an account with this OAuth provider.",
    EmailCreateAccount: "Could not create an account with this email.",
    Callback: "Error in the callback handler.",
    OAuthAccountNotLinked: "This email is already associated with another account. Sign in with the original method.",
    EmailSignin: "Error sending the email sign-in link.",
    CredentialsSignin: "Invalid username/email or password.",
    SessionRequired: "You must be signed in to access this page.",
    Default: "An unexpected error occurred during authentication.",
  };

  const errorMessage = error ? errorMessages[error] || errorMessages.Default : errorMessages.Default;

  return (
    <AuthShell showLanguageSwitcher={false}>
      <div className="text-center">
        <StatusIcon tone="error">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </StatusIcon>

        <h1 className="mt-5 text-[26px] font-bold tracking-[-0.02em]">
          Authentication Error
        </h1>

        <p className="mt-2 text-[13px] leading-normal text-[var(--ink-muted)]">
          {errorMessage}
        </p>

        {error && (
          <div className="mt-5 inline-block rounded-[14px] bg-[var(--surface-2)] px-4 py-2 text-[12px]">
            <span className="text-[var(--ink-muted)]">Error code: </span>
            <code className="font-semibold text-[var(--accent)]">{error}</code>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <a href="/signin" className="block">
            <PrimaryButton type="button">Try Again</PrimaryButton>
          </a>
          <a href="/" className="block">
            <SurfaceButton type="button">Back to Home</SurfaceButton>
          </a>
        </div>
      </div>
    </AuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <AuthShell showLanguageSwitcher={false}>
          <p className="text-center text-[13px] text-[var(--ink-muted)]">Loading...</p>
        </AuthShell>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
