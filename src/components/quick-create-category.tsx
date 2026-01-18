"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

type QuickCreateCategoryProps = {
  onCreated: (category: { id: string; name: string }) => void;
  buttonClassName?: string;
};

export default function QuickCreateCategory({ onCreated, buttonClassName }: QuickCreateCategoryProps) {
  const t = useTranslations("modals.quickCategory");
  const tCommon = useTranslations("common");

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setName("");
        setError("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Focus input when opening
      setTimeout(() => inputRef.current?.focus(), 0);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        onCreated(data.category);
        setIsOpen(false);
        setName("");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create category");
      }
    } catch (err) {
      setError("Failed to create category");
      console.error("Create category error:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setName("");
      setError("");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName || "p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"}
        title={t("createNew")}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Mobile: Full screen modal. Desktop: Floating popup */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 bg-black/50 z-[60] md:hidden" onClick={() => { setIsOpen(false); setName(""); setError(""); }} />

          <div
            ref={popupRef}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60] bg-white rounded-xl shadow-lg border border-slate-200 p-4 md:absolute md:inset-auto md:right-0 md:top-full md:mt-1 md:translate-y-0 md:w-64"
          >
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="font-medium text-slate-900">{t("title")}</span>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("placeholder")}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !name.trim()}
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? t("creating") : tCommon("create")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setName("");
                  setError("");
                }}
                className="px-3 py-1.5 text-slate-600 text-sm hover:text-slate-900 transition-colors"
              >
                {tCommon("cancel")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
