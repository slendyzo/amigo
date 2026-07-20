"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useVisualViewport } from "@/hooks/use-visual-viewport";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The app's single overlay primitive.
 *
 * Guarantees, in order of why this exists:
 *   1. The footer is a sibling of the scroll region, never inside it — the
 *      primary action can never scroll out of reach.
 *   2. The panel is sized against the *visual* viewport (--vvh), so it shrinks
 *      when the on-screen keyboard opens. `dvh` alone does not do this.
 *   3. The footer always clears the home indicator via safe-area padding.
 *   4. Background scroll is locked and overscroll is contained, so a stray
 *      swipe inside a modal can't drag or zoom the page behind it.
 *
 * Compose as: <Modal><ModalHeader/><ModalBody/><ModalFooter/></Modal>
 */

type Variant = "sheet" | "dialog";

type ModalContextValue = {
  variant: Variant;
  scrollable: boolean;
  setScrollable: (value: boolean) => void;
  onClose: () => void;
};

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext(component: string): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error(`${component} must be rendered inside <Modal>`);
  return ctx;
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
} as const;

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "sheet" rises from the bottom on mobile and centers on desktop. "dialog" always centers. */
  variant?: Variant;
  size?: keyof typeof SIZES;
  /** Render the panel as a <form> so the footer's submit button drives it. */
  as?: "div" | "form";
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Set false for flows that must not be dismissed by backdrop/Escape (e.g. onboarding). */
  dismissable?: boolean;
  /**
   * Sheets only: run edge-to-edge on mobile instead of inset by 16px. The app
   * has both looks — the expense sheets are inset, the action pickers are
   * flush — so each modal keeps whichever it already had.
   */
  flush?: boolean;
  className?: string;
  style?: CSSProperties;
  zIndexClassName?: string;
};

export function Modal({
  isOpen,
  onClose,
  children,
  variant = "sheet",
  size = "md",
  as = "div",
  onSubmit,
  dismissable = true,
  flush = false,
  className,
  style,
  zIndexClassName = "z-[60]",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = useState(false);

  useScrollLock(isOpen);
  useVisualViewport(isOpen);

  const handleClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  // Escape to dismiss, and keep Tab inside the panel.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const isSheet = variant === "sheet";

  const panelProps = {
    ref: panelRef as never,
    className: cn(
      "modal-panel relative flex w-full flex-col overflow-hidden",
      SIZES[size],
      isSheet
        ? cn(
            "rounded-t-[28px] md:mx-4 md:rounded-[28px]",
            !flush && "mx-4"
          )
        : "mx-4 rounded-[24px]",
      className
    ),
    style: {
      // Sheets are a canvas: a tinted panel with white cards floating on it,
      // and a white action bar at the bottom. Centered dialogs are a single
      // card — one flat surface all the way through, no two-tone footer.
      background: isSheet ? "var(--app-bg)" : "var(--surface)",
      color: "var(--ink)",
      boxShadow: "var(--shadow-pop)",
      ...style,
    } as CSSProperties,
    initial: isSheet ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 8 },
    animate: isSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 },
    transition: { duration: isSheet ? 0.33 : 0.28, ease: EASE },
    role: "dialog" as const,
    "aria-modal": true,
  };

  return (
    <div
      className={cn(
        "modal-viewport fixed inset-x-0 flex justify-center",
        zIndexClassName,
        isSheet ? "items-end md:items-center" : "items-center"
      )}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(23,22,31,.45)" }}
        onClick={handleClose}
      />

      <ModalContext.Provider value={{ variant, scrollable, setScrollable, onClose }}>
        {as === "form" ? (
          <motion.form onSubmit={onSubmit} {...panelProps}>
            {children}
          </motion.form>
        ) : (
          <motion.div {...panelProps}>{children}</motion.div>
        )}
      </ModalContext.Provider>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type ModalHeaderProps = {
  title?: ReactNode;
  /** Pass false to hide the close button (e.g. a required step). */
  showClose?: boolean;
  children?: ReactNode;
  className?: string;
};

export function ModalHeader({
  title,
  showClose = true,
  children,
  className,
}: ModalHeaderProps) {
  const { variant, onClose } = useModalContext("ModalHeader");

  return (
    <div className={cn("flex-shrink-0", className)}>
      {variant === "sheet" && (
        <div className="flex justify-center pt-2.5 md:hidden">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: "rgba(23,22,31,.15)" }}
          />
        </div>
      )}

      {(title || showClose) && (
        <div className="flex items-center justify-between px-4 py-2 md:px-5 md:py-3">
          {typeof title === "string" ? (
            <h2 className="text-[17px] font-bold text-[var(--ink)]">{title}</h2>
          ) : (
            title
          )}
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="tap-none flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-subtle)] transition-colors active:text-[var(--ink)] md:hover:text-[var(--ink)]"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type ModalBodyProps = {
  children: ReactNode;
  className?: string;
};

export function ModalBody({ children, className }: ModalBodyProps) {
  const { setScrollable } = useModalContext("ModalBody");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // The footer's divider only appears when there is genuinely content hidden
  // below the fold, so short dialogs look exactly as they did before.
  //
  // Children are rendered directly into the scroller (no wrapper div) so that
  // layout classes passed via className — flex, gap-*, space-y-* — still apply
  // to the real content. That costs us the single element we'd otherwise
  // observe, so growth is tracked by observing each direct child and re-syncing
  // when the subtree changes.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => {
      setScrollable(scroller.scrollHeight - scroller.clientHeight > 1);
    };

    const resizeObserver = new ResizeObserver(measure);
    const observed = new Set<Element>();

    const syncChildren = () => {
      for (const child of Array.from(scroller.children)) {
        if (!observed.has(child)) {
          resizeObserver.observe(child);
          observed.add(child);
        }
      }
      for (const child of Array.from(observed)) {
        if (child.parentNode !== scroller) {
          resizeObserver.unobserve(child);
          observed.delete(child);
        }
      }
      measure();
    };

    resizeObserver.observe(scroller);
    syncChildren();

    // Catches content added/removed (conditional sections, async lists).
    const mutationObserver = new MutationObserver(syncChildren);
    mutationObserver.observe(scroller, { childList: true, subtree: true });

    scroller.addEventListener("scroll", measure, { passive: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, [setScrollable]);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "scroll-touch min-h-0 flex-1 overflow-y-auto px-5 pb-4",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type ModalFooterProps = {
  children: ReactNode;
  className?: string;
  /** Override the footer surface. Inline styles beat classes, so a Tailwind
   *  bg-* utility can't win against the default without !important. */
  style?: CSSProperties;
};

export function ModalFooter({ children, className, style }: ModalFooterProps) {
  const { scrollable, variant } = useModalContext("ModalFooter");

  return (
    <div
      className={cn(
        "modal-footer flex flex-shrink-0 gap-3 px-4 pt-3 md:px-5",
        variant === "sheet" ? "modal-footer--safe" : "pb-3 md:pb-4",
        scrollable && "is-scrollable",
        className
      )}
      style={{
        // Transparent on dialogs so the panel reads as one card; the divider
        // alone separates the actions once the body starts scrolling.
        background: variant === "sheet" ? "var(--surface)" : "transparent",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
