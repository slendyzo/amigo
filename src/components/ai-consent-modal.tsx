"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";

interface AiConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiConsentModal({ isOpen, onClose }: AiConsentModalProps) {
  const t = useTranslations("aiAdvisor");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleChoice = async (action: "enable" | "decline") => {
    setIsLoading(true);
    try {
      await fetch("/api/user/ai-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.error("Failed to save AI consent:", err);
    } finally {
      setIsLoading(false);
      onClose();
      router.refresh();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="dialog"
      size="md"
      dismissable={false}
      zIndexClassName="z-50"
      className="rounded-xl"
      style={{ background: "var(--surface)" }}
    >
      <ModalBody className="px-6 pt-6 pb-0">
        <div className="space-y-5">
          {/* Title */}
          <h2 className="text-2xl font-semibold text-[var(--ink)]">
            {t("consent.title")}
          </h2>

          {/* Description */}
          <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
            {t("consent.description")}
          </p>

          {/* Privacy disclosure block */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              {t("consent.privacy")}
            </p>
            <Link
              href="/terms"
              className="inline-block mt-2 text-xs text-[var(--ink-subtle)] underline underline-offset-2 hover:text-[var(--ink)] transition-colors"
            >
              {t("consent.viewTerms")}
            </Link>
          </div>
        </div>
      </ModalBody>

      {/* Buttons */}
      <ModalFooter className="flex-col sm:flex-row gap-3 px-6 pt-6 pb-6 md:px-6 md:pb-6">
        <button
          onClick={() => handleChoice("decline")}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-[var(--line-strong)] px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("consent.decline")}
        </button>
        <button
          onClick={() => handleChoice("enable")}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--surface)] hover:bg-[var(--ink-muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("consent.enable")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
