"use client";

import { useState, useEffect } from "react";
import AddExpenseModal from "./add-expense-modal";

export default function GlobalAddButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Listen for keyboard shortcut (Ctrl/Cmd + Shift + A or just "n" key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + A
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setIsModalOpen(true);
      }
      // "n" key when not in an input field
      if (
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setIsModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for openQuickAdd event (from mobile nav)
  useEffect(() => {
    const handleQuickAdd = () => setIsModalOpen(true);
    window.addEventListener("openQuickAdd", handleQuickAdd);
    return () => window.removeEventListener("openQuickAdd", handleQuickAdd);
  }, []);

  return (
    <>
      {/* Desktop floating button - hidden on mobile (mobile uses bottom nav) */}
      {/* Positioned higher to avoid overlapping pagination controls */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="hidden md:flex fixed bottom-24 right-8 w-14 h-14 rounded-full bg-[#0070f3] text-white items-center justify-center shadow-lg hover:bg-[#0060df] transition-all hover:scale-105 active:scale-95 z-40"
        title="Add expense (n)"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* The modal - works for both desktop and mobile */}
      <AddExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
