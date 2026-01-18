"use client";

import { useEffect } from "react";

/**
 * Manages the modal-open class on document.body when a modal is open.
 * This prevents background scrolling while modal is visible and hides mobile nav.
 * @param isOpen - Whether the modal is currently open
 */
export function useModalBodyClass(isOpen: boolean): void {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isOpen]);
}
