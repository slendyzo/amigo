"use client";

// Shared value-over-time chart for RWA detail pages.
//
// Visual grammar (canonical, applies to vehicles + properties):
//   • Solid filled dot   = real scraped data (purchase / web_archive / live_scrape)
//   • Hollow ring dot    = AI-estimated gap fill (ai_estimate)
//   • Diamond dot        = user-entered manual valuation (manual)
//   • Faded reference line = INE index (property) or AI baseline (vehicle)
//   • Tooltip            = source-aware ("Market data • 28 listings",
//                          "AI estimate", "Your entry: <note>")
//
// Loading state: skeleton card with shimmer + progress copy.
// no_data state: explainer + Add valuation CTA.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export type ValuePointSource =
  | "purchase"
  | "web_archive"
  | "live_scrape"
  | "ai_estimate"
  | "manual";

export type ValuePoint = {
  date: string; // ISO yyyy-mm-dd
  value: number; // EUR
  source: ValuePointSource;
  sampleSize?: number | null;
  note?: string | null;
};

export type ReferenceLinePoint = {
  date: string;
  value: number;
};

export type ValueOverTimeChartProps = {
  points: ValuePoint[];
  /** Smooth secondary series rendered as a faded line behind the dots. */
  referenceLine?: ReferenceLinePoint[];
  /** Label for the reference series chip in the top-right of the chart. */
  referenceLabel?: string;
  status?: "loading" | "done" | "no_data";
  progress?: { current: number; total: number };
  onAddValuation?: () => void;
  /** Translations / copy. Kept on caller side so this stays presentation-only. */
  copy?: Partial<{
    title: string;
    addValuation: string;
    loadingTitle: string;
    loadingHint: string; // "Building history… {current}/{total} snapshots fetched"
    emptyTitle: string;
    emptyBody: string;
    sourcePurchase: string;
    sourceWebArchive: string;
    sourceLiveScrape: string;
    sourceAiEstimate: string;
    sourceManual: string;
    listingsLabel: string; // "{n} listings"
    yourEntryLabel: string; // "Your entry"
    aiEstimateLabel: string;
  }>;
};

const DEFAULT_COPY = {
  title: "Value over time",
  addValuation: "Add valuation",
  loadingTitle: "Building history",
  loadingHint: "{current}/{total} snapshots fetched",
  emptyTitle: "Limited market data for this asset",
  emptyBody:
    "We couldn't find enough comparable listings to draw a value curve. Add a valuation you know about — independent appraisal, insurance value, or an offer received.",
  sourcePurchase: "Purchase",
  sourceWebArchive: "Market data",
  sourceLiveScrape: "Market data",
  sourceAiEstimate: "AI estimate",
  sourceManual: "Your entry",
  listingsLabel: "{n} listings",
  yourEntryLabel: "Your entry",
  aiEstimateLabel: "AI estimate",
} as const;

const COLOR = "var(--primary)";
const COLOR_REF = "var(--muted-foreground)";

export function ValueOverTimeChart({
  points,
  referenceLine,
  referenceLabel,
  status = "done",
  progress,
  onAddValuation,
  copy: copyOverrides,
}: ValueOverTimeChartProps) {
  const copy = { ...DEFAULT_COPY, ...copyOverrides };

  const sortedPoints = useMemo(
    () =>
      [...points]
        .filter((p) => Number.isFinite(p.value) && p.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  );

  const data = useMemo(() => {
    // Build the unified series. Reference line values get merged onto matching
    // dates if present; otherwise they live on their own date keys.
    const map = new Map<string, { date: string; value: number | null; ref: number | null; src: ValuePointSource | null; sampleSize: number | null; note: string | null }>();
    for (const p of sortedPoints) {
      map.set(p.date, {
        date: p.date,
        value: p.value,
        ref: null,
        src: p.source,
        sampleSize: p.sampleSize ?? null,
        note: p.note ?? null,
      });
    }
    if (referenceLine) {
      for (const r of referenceLine) {
        const row = map.get(r.date);
        if (row) {
          row.ref = r.value;
        } else {
          map.set(r.date, {
            date: r.date,
            value: null,
            ref: r.value,
            src: null,
            sampleSize: null,
            note: null,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [sortedPoints, referenceLine]);

  if (status === "loading") {
    return (
      <Card>
        <Header title={copy.loadingTitle} chip={referenceLabel} />
        <SkeletonChart />
        {progress != null && (
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            {copy.loadingTitle} · {fmt(copy.loadingHint, progress)}
          </p>
        )}
      </Card>
    );
  }

  if (status === "no_data" || sortedPoints.length === 0) {
    return (
      <Card>
        <Header title={copy.title} chip={referenceLabel} />
        <div className="mt-1 rounded-2xl bg-muted/30 px-5 py-8 text-center">
          <p className="text-sm font-medium">{copy.emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.emptyBody}</p>
          {onAddValuation && (
            <button
              onClick={onAddValuation}
              className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {copy.addValuation}
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <Header title={copy.title} chip={referenceLabel} />
        {onAddValuation && (
          <button
            onClick={onAddValuation}
            className="rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            + {copy.addValuation}
          </button>
        )}
      </div>

      <div className="mt-3 h-[260px] w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-muted-foreground"
              tickFormatter={(v) => formatTickDate(v)}
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-muted-foreground"
              tickFormatter={(v) => abbrevCurrency(typeof v === "number" ? v : Number(v))}
              width={55}
            />

            {referenceLine && referenceLine.length > 0 && (
              <Area
                type="monotone"
                dataKey="ref"
                stroke={COLOR_REF}
                strokeOpacity={0.35}
                strokeWidth={1.5}
                fill={COLOR_REF}
                fillOpacity={0.04}
                isAnimationActive
                animationEasing="ease-out"
                animationDuration={500}
                connectNulls
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              stroke={COLOR}
              strokeWidth={1.75}
              isAnimationActive
              animationEasing="ease-out"
              animationDuration={500}
              connectNulls
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dot={(props: any) => <SourceDot {...props} />}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              activeDot={(props: any) => <SourceDot {...props} active />}
            />

            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={(p: any) => <CustomTooltip {...p} copy={copy} />}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <Legend copy={copy} hasManual={sortedPoints.some((p) => p.source === "manual")} hasEstimate={sortedPoints.some((p) => p.source === "ai_estimate")} />
    </Card>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="rounded-2xl border border-border/60 bg-card/80 p-5 backdrop-blur-sm"
    >
      {children}
    </motion.section>
  );
}

function Header({ title, chip }: { title: string; chip?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">{title}</h2>
      {chip && (
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {chip}
        </span>
      )}
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="mt-3 h-[260px] w-full overflow-hidden rounded-xl bg-gradient-to-r from-muted/20 via-muted/40 to-muted/20 bg-[length:200%_100%] animate-[shimmer_2s_infinite]">
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  );
}

type DotProps = {
  cx?: number;
  cy?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
  active?: boolean;
};

function SourceDot({ cx, cy, payload, active }: DotProps) {
  if (cx == null || cy == null || payload == null) return null;
  const src = (payload.src ?? null) as ValuePointSource | null;
  if (src == null) return null; // reference-only points have no dot

  const r = active ? 6 : 4.5;
  const stroke = COLOR;

  if (src === "manual") {
    // Diamond — rotated square
    const half = r + 0.5;
    return (
      <g>
        <rect
          x={cx - half}
          y={cy - half}
          width={half * 2}
          height={half * 2}
          transform={`rotate(45 ${cx} ${cy})`}
          fill="var(--card)"
          stroke={stroke}
          strokeWidth={1.75}
        />
      </g>
    );
  }

  if (src === "ai_estimate") {
    return <circle cx={cx} cy={cy} r={r} fill="var(--card)" stroke={stroke} strokeWidth={1.75} />;
  }

  // purchase, web_archive, live_scrape — solid filled dot
  return <circle cx={cx} cy={cy} r={r} fill={stroke} stroke="var(--card)" strokeWidth={1.5} />;
}

type CopyShape = { -readonly [K in keyof typeof DEFAULT_COPY]: string };

type TooltipShape = {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  copy: CopyShape;
};

function CustomTooltip({ active, payload, copy }: TooltipShape) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0]?.payload as
    | {
        date: string;
        value: number | null;
        ref: number | null;
        src: ValuePointSource | null;
        sampleSize: number | null;
        note: string | null;
      }
    | undefined;
  if (!entry) return null;

  const sourceLabel = entry.src
    ? entry.src === "purchase"
      ? copy.sourcePurchase
      : entry.src === "web_archive" || entry.src === "live_scrape"
      ? copy.sourceWebArchive
      : entry.src === "ai_estimate"
      ? copy.sourceAiEstimate
      : copy.sourceManual
    : null;

  return (
    <div className="rounded-lg border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
      <p className="font-medium tabular-nums">{formatTickDate(entry.date, true)}</p>
      {entry.value != null && (
        <p className="mt-1 text-base font-semibold tabular-nums" style={{ color: COLOR }}>
          {formatCurrency(entry.value, "EUR")}
        </p>
      )}
      {entry.ref != null && entry.value == null && (
        <p className="mt-1 text-base font-semibold tabular-nums text-muted-foreground">
          {formatCurrency(entry.ref, "EUR")}
        </p>
      )}
      {sourceLabel && (
        <p className="mt-1 text-muted-foreground">
          {sourceLabel}
          {entry.sampleSize != null && entry.sampleSize > 0
            ? ` · ${fmt(copy.listingsLabel, { n: entry.sampleSize })}`
            : ""}
        </p>
      )}
      {entry.note && entry.src === "manual" && (
        <p className="mt-1 max-w-[16rem] text-muted-foreground">{entry.note}</p>
      )}
    </div>
  );
}

function Legend({
  copy,
  hasManual,
  hasEstimate,
}: {
  copy: CopyShape;
  hasManual: boolean;
  hasEstimate: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" /> {copy.sourceWebArchive}
      </span>
      {hasEstimate && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-primary bg-card" /> {copy.aiEstimateLabel}
        </span>
      )}
      {hasManual && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[7px] w-[7px] rotate-45 border border-primary bg-card" /> {copy.yourEntryLabel}
        </span>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTickDate(iso: string, full = false): string {
  // iso may be either yyyy-mm-dd or full ISO; we just slice the date part.
  const slice = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const [y, m] = slice.split("-");
  if (!y || !m) return iso;
  return full ? slice : `${m}/${y.slice(2)}`;
}

function abbrevCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(0)}k`;
  return `€${Math.round(v)}`;
}

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// Suppress unused-arg warnings on the cn import keeping this file presentation-only.
void cn;
