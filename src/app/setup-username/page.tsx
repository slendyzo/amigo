"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AuthShell,
  AuthHeader,
  FieldCard,
  PrimaryButton,
  StatusBanner,
} from "../signin/auth-ui";

export default function SetupUsernamePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/setup-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Something went wrong");
      setIsLoading(false);
    }
  };

  return (
    <AuthShell showLanguageSwitcher={false}>
      <AuthHeader
        title="Choose a Username"
        tagline="Welcome back! Please set up a username for easier login."
        logoSize={56}
      />

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <FieldCard
          id="username"
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          required
          minLength={3}
          maxLength={20}
          placeholder="johndoe"
          autoFocus
          hint="3-20 characters, lowercase letters, numbers, and underscores only"
        />

        <PrimaryButton type="submit" disabled={isLoading || username.length < 3}>
          {isLoading ? "Setting up..." : "Continue"}
        </PrimaryButton>

        <button
          type="button"
          onClick={() => router.push("/dashboard?skipUsername=true")}
          className="mx-auto py-2 text-[13px] font-medium text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink-muted)]"
        >
          Skip for now
        </button>
      </form>
    </AuthShell>
  );
}
