"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-white dark:bg-slate-950">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Authentication Error
        </h1>

        <p className="text-slate-600 dark:text-slate-400 mb-6">
          {errorMessage}
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Error code: </span>
            <code className="text-slate-700 dark:text-slate-300">{error}</code>
          </div>
        )}

        <div className="space-y-3">
          <a
            href="/auth/signin"
            className="block w-full rounded-lg bg-[#0070f3] px-4 py-3 text-white font-medium hover:bg-[#0060df] transition-colors"
          >
            Try Again
          </a>
          <a
            href="/"
            className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-white dark:bg-slate-950">
        <div className="w-full max-w-md text-center">
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </main>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
