"use client";

/**
 * MobileNav — composes the Forest & Bracket mobile chrome:
 *   <MobileTabBar /> with <MobileFAB /> in its center slot.
 *
 * Keeps the existing prop contract so dashboard-shell.tsx continues to work:
 *   - onAddClick: triggers the quick-add modal (also dispatches openQuickAdd)
 *   - userEmail / onSignOut: passed through (account-tab profile menu can use
 *     these in a follow-up; for now we accept them so the contract is stable).
 *   - hideFloatingButtons: when true, suppress the FAB (used on routes that
 *     bring up their own primary CTA).
 */

import MobileTabBar from "./mobile-tab-bar";
import MobileFAB from "./mobile-fab";

interface MobileNavProps {
  onAddClick?: () => void;
  userEmail?: string;
  onSignOut?: () => void;
  hideFloatingButtons?: boolean;
}

export default function MobileNav({
  onAddClick,
  userEmail: _userEmail,
  onSignOut: _onSignOut,
  hideFloatingButtons,
}: MobileNavProps) {
  // userEmail / onSignOut are reserved for the upcoming Account tab profile
  // menu — kept in the prop contract on purpose so dashboard-shell doesn't
  // need to change when that lands.
  return (
    <MobileTabBar
      centerSlot={
        hideFloatingButtons ? null : <MobileFAB onClick={onAddClick} ariaLabel="Adicionar despesa" />
      }
    />
  );
}
