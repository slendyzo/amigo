export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 animate-pulse">
      {/* Pushed header */}
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-full bg-[var(--surface-2)]" />
        <div className="h-4 w-24 rounded bg-[var(--surface-2)]" />
        <div className="h-10 w-10" />
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-3)]" />
        <div className="h-3 w-12 rounded bg-[var(--surface-2)]" />
      </div>

      <div className="flex gap-5">
        {/* Focus card */}
        <div className="flex-1 space-y-3">
          <div className="rounded-[24px] bg-[var(--surface)] p-[22px] shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-[12px] bg-[var(--surface-2)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-28 rounded bg-[var(--surface-2)]" />
              </div>
              <div className="h-4 w-16 rounded bg-[var(--surface-2)]" />
            </div>
            <div className="mt-4 h-12 rounded-[16px] bg-[var(--surface-2)]" />
            <div className="mt-3.5 flex gap-2">
              <div className="h-11 flex-1 rounded-[14px] bg-[var(--surface-2)]" />
              <div className="h-11 flex-1 rounded-[14px] bg-[var(--surface-2)]" />
              <div className="h-11 w-11 rounded-[14px] bg-[var(--surface-2)]" />
            </div>
          </div>
          {/* Next item peek */}
          <div className="rounded-[20px] bg-[var(--surface)] px-[18px] py-3.5 opacity-50 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <div className="h-[38px] w-[38px] rounded-[12px] bg-[var(--surface-2)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-[var(--surface-2)]" />
                <div className="h-2.5 w-16 rounded bg-[var(--surface-2)]" />
              </div>
            </div>
          </div>
        </div>

        {/* History sidebar (desktop) */}
        <div className="hidden w-72 flex-shrink-0 self-start rounded-[20px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:block">
          <div className="h-4 w-32 rounded bg-[var(--surface-2)]" />
          <div className="mt-4 space-y-3">
            <div className="h-8 rounded bg-[var(--surface-2)]" />
            <div className="h-8 rounded bg-[var(--surface-2)]" />
            <div className="h-8 rounded bg-[var(--surface-2)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
