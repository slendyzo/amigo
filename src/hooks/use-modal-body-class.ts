"use client";

import { useEffect, useRef } from "react";

/**
 * Manages the modal-open class on document.body when a modal is open.
 * This prevents background scrolling while modal is visible and hides mobile nav.
 * Saves and restores scroll position to prevent jumping to top on close.
 * @param isOpen - Whether the modal is currently open
 */
export function useModalBodyClass(isOpen: boolean): void {
  const scrollPositionRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      scrollPositionRef.current = window.scrollY;
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
      const savedPosition = scrollPositionRef.current;
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
      });
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isOpen]);
}
