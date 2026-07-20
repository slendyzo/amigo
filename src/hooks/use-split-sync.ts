"use client";

import { useEffect, useState } from "react";
import {
  type SplitPerson,
  initializeSplit,
  recalculateSplit,
} from "@/lib/split-utils";

type UseSplitSyncArgs = {
  amount: number;
  splitEnabled: boolean;
  splitCount: number;
  splitPeople: SplitPerson[] | null;
  onSplitPeopleChange: (people: SplitPerson[] | null) => void;
  meLabel: string;
  lockedExceedsMessage: string;
};

/**
 * Keeps `splitPeople` consistent with the amount and head count.
 *
 * This deliberately lives in the modal (which stays mounted for as long as the
 * modal is open) rather than in ExpenseSplitSection. That section only renders
 * while "More options" is expanded, so when the recalculation lived there,
 * editing the amount with the section collapsed left the per-person shares
 * frozen at their old values — and the stale split was then persisted, making
 * every downstream total wrong.
 *
 * Deps intentionally exclude `splitPeople`: the effect writes to it, and
 * re-running on its own output would loop. Per-row edits (lock, amount, label)
 * are already recalculated at the point of edit inside the section.
 */
export function useSplitSync({
  amount,
  splitEnabled,
  splitCount,
  splitPeople,
  onSplitPeopleChange,
  meLabel,
  lockedExceedsMessage,
}: UseSplitSyncArgs) {
  const [splitError, setSplitError] = useState("");

  useEffect(() => {
    if (!splitEnabled) {
      setSplitError("");
      return;
    }
    if (amount <= 0) return;

    const hasLocks =
      !!splitPeople &&
      splitPeople.length === splitCount &&
      splitPeople.some((p) => p.locked);

    if (hasLocks) {
      // Preserve the locked rows, redistribute the rest.
      const adjusted = recalculateSplit(amount, splitPeople!);
      if (adjusted) {
        onSplitPeopleChange(adjusted);
        setSplitError("");
      } else {
        setSplitError(lockedExceedsMessage);
      }
    } else {
      // Equal split — carries custom labels over.
      onSplitPeopleChange(initializeSplit(amount, splitCount, meLabel, splitPeople));
      setSplitError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, splitCount, splitEnabled]);

  return { splitError, setSplitError };
}
