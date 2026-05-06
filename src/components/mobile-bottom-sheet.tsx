"use client";

/**
 * MobileBottomSheet — Forest & Bracket bottom sheet primitive.
 *
 * Paper-deep panel with ink rule, drag-handle on top, framer-motion drag/spring,
 * keyboard-aware expand-on-focus, safe-area inset bottom.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - children: ReactNode
 *  - snapPoints?: number[]   (heights as fraction of viewport, default [0.5, 0.92])
 *  - initialSnap?: number    (index into snapPoints, default snapPoints.length - 1)
 *
 * Backdrop is paper-deep tinted (never pure black). Drag down >40% closes.
 */

import {
  AnimatePresence,
  motion,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  snapPoints?: number[];
  initialSnap?: number;
  ariaLabel?: string;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  snapPoints = [0.5, 0.92],
  initialSnap,
  ariaLabel,
}: MobileBottomSheetProps) {
  // Sort ascending to keep math predictable
  const snaps = useMemo(() => [...snapPoints].sort((a, b) => a - b), [snapPoints]);
  const defaultSnap = initialSnap ?? snaps.length - 1;
  const [activeSnap, setActiveSnap] = useState<number>(defaultSnap);
  const [viewportH, setViewportH] = useState<number>(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const y = useMotionValue(0);

  // Track viewport height (for visualViewport keyboard events too)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      setViewportH(h);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  // Reset to initial snap whenever opening
  useEffect(() => {
    if (isOpen) setActiveSnap(defaultSnap);
  }, [isOpen, defaultSnap]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Keyboard-aware: when an input/textarea inside the sheet receives focus,
  // jump to the largest snap point so the field isn't covered.
  useEffect(() => {
    if (!isOpen) return;
    const node = sheetRef.current;
    if (!node) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        (t as HTMLElement).isContentEditable
      ) {
        setActiveSnap(snaps.length - 1);
      }
    };
    node.addEventListener("focusin", onFocusIn);
    return () => node.removeEventListener("focusin", onFocusIn);
  }, [isOpen, snaps.length]);

  // Compute target sheet height in px from active snap
  const targetHeight = Math.round(viewportH * snaps[activeSnap]);

  const handleDragEnd = useCallback(
    (_e: unknown, info: PanInfo) => {
      const offset = info.offset.y; // positive = drag down
      const velocity = info.velocity.y;

      // Strong downward fling — close
      if (velocity > 600) {
        onClose();
        return;
      }

      // Drag down >40% of current sheet height — close
      if (offset > targetHeight * 0.4) {
        onClose();
        return;
      }

      // Drag up — promote to a higher snap if available and motion was meaningful
      if (offset < -60 && activeSnap < snaps.length - 1) {
        setActiveSnap(activeSnap + 1);
        return;
      }

      // Drag down (gentle) — demote to lower snap if available
      if (offset > 60 && activeSnap > 0) {
        setActiveSnap(activeSnap - 1);
        return;
      }

      // Otherwise snap back to current
      // (motion's animate-on-drag-end will run via the y prop reset below)
    },
    [activeSnap, onClose, snaps.length, targetHeight],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="amigo-sheet-portal"
          className="fixed inset-0 z-[60] md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
          aria-hidden={false}
        >
          {/* Backdrop — paper-deep tint, never pure black */}
          <motion.button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="absolute inset-0 cursor-default"
            style={{
              background: "rgba(232, 224, 204, 0.7)", // paper-deep / 70
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          />

          {/* Sheet panel */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            drag="y"
            dragElastic={{ top: 0.05, bottom: 0.4 }}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{ y, height: targetHeight }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              stiffness: 360,
              damping: 36,
              mass: 0.9,
            }}
            className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
          >
            <div
              className="flex flex-col flex-1 min-h-0"
              style={{
                background: "var(--paper-deep)",
                border: "1px solid var(--ink)",
                borderBottom: "none",
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                boxShadow:
                  "0 -8px 24px rgba(20,20,15,0.10), 0 -2px 6px rgba(20,20,15,0.06)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
            >
              {/* Drag handle: paper-deep pill with gilt-soft top stroke, 6px from top */}
              <div
                className="flex justify-center pt-[6px] pb-2 select-none"
                aria-hidden
              >
                <span
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 999,
                    background: "var(--paper-deep)",
                    boxShadow: "0 -1px 0 var(--gilt-soft)",
                    border: "1px solid var(--rule-strong)",
                    display: "block",
                  }}
                />
              </div>

              {/* Content (scrollable) */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
