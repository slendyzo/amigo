"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Invitation {
  id: string;
  email: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    type: string;
  };
  invitedBy: {
    name: string | null;
    email: string;
  };
  expiresAt: string;
}

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [success, setSuccess] = useState(false);

  const token = params.token as string;

  // Fetch invitation details
  useEffect(() => {
    if (token) {
      fetchInvitation();
    }
  }, [token]);

  const fetchInvitation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/${token}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load invitation");
        setErrorCode(data.code);
        return;
      }

      setInvitation(data);
    } catch (err) {
      setError("Failed to load invitation");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!invitation) return;

    setIsAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/${token}`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "UNAUTHORIZED") {
          // Redirect to signin with return URL
          router.push(`/auth/signin?callbackUrl=/invitations/${token}`);
          return;
        }
        setError(data.error || "Failed to accept invitation");
        setErrorCode(data.code);
        return;
      }

      setSuccess(true);

      // Switch to the new workspace and redirect
      await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspace.id }),
      });

      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      setError("Failed to accept invitation");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!invitation) return;
    if (!confirm("Are you sure you want to decline this invitation?")) return;

    setIsDeclining(true);

    try {
      const res = await fetch(`/api/invitations/${token}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to decline invitation");
      }
    } catch (err) {
      setError("Failed to decline invitation");
    } finally {
      setIsDeclining(false);
    }
  };

  // Loading state
  if (isLoading || status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome!</h1>
          <p className="text-slate-600 mb-6">
            You&apos;ve joined <strong>{invitation?.workspace.name}</strong> as a {invitation?.role.toLowerCase()}.
          </p>
          <p className="text-sm text-slate-500">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Error states
  if (error) {
    const isExpired = errorCode === "EXPIRED";
    const isNotFound = errorCode === "NOT_FOUND";
    const isAlreadyAccepted = errorCode === "ALREADY_ACCEPTED";
    const isEmailMismatch = errorCode === "EMAIL_MISMATCH";

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isAlreadyAccepted ? "bg-blue-100" : "bg-red-100"
          }`}>
            {isAlreadyAccepted ? (
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isExpired
              ? "Invitation Expired"
              : isNotFound
              ? "Invitation Not Found"
              : isAlreadyAccepted
              ? "Already Accepted"
              : isEmailMismatch
              ? "Wrong Account"
              : "Error"}
          </h1>
          <p className="text-slate-600 mb-6">
            {isExpired
              ? "This invitation has expired. Please ask the workspace owner to send a new invitation."
              : isNotFound
              ? "This invitation link is invalid or has been cancelled."
              : isAlreadyAccepted
              ? "This invitation has already been accepted. You may already have access to the workspace."
              : isEmailMismatch
              ? `This invitation was sent to a different email address. Please sign in with the correct account.`
              : error}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Not signed in - show sign in prompt
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re Invited!</h1>
          {invitation && (
            <>
              <p className="text-slate-600 mb-2">
                <strong>{invitation.invitedBy.name || invitation.invitedBy.email}</strong> invited you to join
              </p>
              <p className="text-xl font-semibold text-blue-600 mb-4">{invitation.workspace.name}</p>
            </>
          )}
          <p className="text-slate-500 mb-6">Please sign in or create an account to accept this invitation.</p>
          <div className="space-y-3">
            <Link
              href={`/auth/signin?callbackUrl=/invitations/${token}`}
              className="block w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Sign In
            </Link>
            <Link
              href={`/auth/signup?callbackUrl=/invitations/${token}`}
              className="block w-full px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Signed in - show accept/decline
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Workspace Invitation</h1>

        {invitation && (
          <>
            <p className="text-slate-600 mb-1">
              <strong>{invitation.invitedBy.name || invitation.invitedBy.email}</strong> has invited you to join
            </p>
            <p className="text-xl font-semibold text-blue-600 mb-4">{invitation.workspace.name}</p>

            <div className="bg-slate-50 rounded-lg p-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Role:</span>
                <span className="font-medium text-slate-900">{invitation.role}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-slate-500">Expires:</span>
                <span className="font-medium text-slate-900">
                  {new Date(invitation.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleAccept}
                disabled={isAccepting}
                className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                {isAccepting ? "Accepting..." : "Accept Invitation"}
              </button>
              <button
                onClick={handleDecline}
                disabled={isDeclining}
                className="w-full px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-50"
              >
                {isDeclining ? "Declining..." : "Decline"}
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-slate-400 mt-6">
          Signed in as {session.user?.email}
        </p>
      </div>
    </div>
  );
}
