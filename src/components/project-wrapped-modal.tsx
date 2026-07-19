"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";

type WrappedData = {
  projectName: string;
  totalSpent: number;
  expenseCount: number;
  budgetUsage: number | null;
  budget: number | null;
  topCategories: {
    name: string;
    total: number;
    count: number;
    percentage: number;
  }[];
  monthlyBreakdown: {
    month: string;
    total: number;
    count: number;
  }[];
  dateRange: {
    start: string;
    end: string;
  } | null;
  highestExpense: {
    name: string;
    amount: number;
    date: string;
  } | null;
  averageExpense: number;
};

type ProjectWrappedModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
};

function AnimatedCounter({ value, duration = 2000 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setDisplayValue(value * easeOutQuart);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{displayValue.toFixed(2)}</span>;
}

export default function ProjectWrappedModal({
  isOpen,
  onClose,
  projectId,
}: ProjectWrappedModalProps) {
  const t = useTranslations("projects.projectWrapped");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [data, setData] = useState<WrappedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [slideDirection, setSlideDirection] = useState<"next" | "prev">("next");

  const totalSlides = 5;

  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      fetchWrappedData();
    }
  }, [isOpen, projectId]);

  const fetchWrappedData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/wrapped`);
      if (response.ok) {
        const result = await response.json();
        setData(result.wrapped);
      }
    } catch (error) {
      console.error("Failed to fetch wrapped data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const nextSlide = useCallback(() => {
    if (currentSlide < totalSlides - 1) {
      setSlideDirection("next");
      setCurrentSlide((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [currentSlide, totalSlides, onClose]);

  const prevSlide = useCallback(() => {
    if (currentSlide > 0) {
      setSlideDirection("prev");
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        nextSlide();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevSlide();
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, nextSlide, prevSlide, onClose]);

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const maxMonthlyTotal = data?.monthlyBreakdown
    ? Math.max(...data.monthlyBreakdown.map((m) => m.total))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 overflow-hidden rounded-[24px] shadow-2xl"
        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-soft))" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="relative min-h-[480px] p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="animate-spin w-10 h-10 border-4 border-white/30 border-t-white rounded-full" />
            </div>
          ) : !data || data.expenseCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-white text-center">
              <svg className="w-16 h-16 mb-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-xl font-medium">No expenses yet</p>
              <p className="opacity-80 mt-2">Add some expenses to see your wrapped!</p>
            </div>
          ) : (
            <div className="relative">
              {/* Slide 0: Intro */}
              <div
                className={`transition-all duration-500 ${
                  currentSlide === 0
                    ? "opacity-100 translate-x-0"
                    : slideDirection === "next"
                    ? "opacity-0 -translate-x-full absolute inset-0"
                    : "opacity-0 translate-x-full absolute inset-0"
                }`}
              >
                <div className="flex flex-col items-center justify-center min-h-[400px] text-white text-center">
                  <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-6">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold mb-2">{data.projectName}</h2>
                  <p className="text-lg opacity-80">{t("yourSummary")}</p>
                  {data.dateRange && (
                    <p className="text-sm opacity-60 mt-4">
                      {formatDate(data.dateRange.start)} - {formatDate(data.dateRange.end)}
                    </p>
                  )}
                </div>
              </div>

              {/* Slide 1: Total Spent */}
              <div
                className={`transition-all duration-500 ${
                  currentSlide === 1
                    ? "opacity-100 translate-x-0"
                    : currentSlide > 1
                    ? "opacity-0 -translate-x-full absolute inset-0"
                    : "opacity-0 translate-x-full absolute inset-0"
                }`}
              >
                <div className="flex flex-col items-center justify-center min-h-[400px] text-white text-center">
                  <p className="text-lg opacity-80 mb-4">{t("totalSpent")}</p>
                  <p className="text-6xl font-bold mb-6">
                    {currentSlide === 1 && (
                      <>
                        <span className="text-4xl">€</span>
                        <AnimatedCounter value={data.totalSpent} duration={1500} />
                      </>
                    )}
                  </p>
                  <p className="text-lg opacity-80">
                    {data.expenseCount} {data.expenseCount === 1 ? "expense" : "expenses"}
                  </p>
                  {data.budget && (
                    <div className="mt-8 w-full max-w-xs">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="opacity-80">{t("budgetUsed")}</span>
                        <span className="font-medium">{data.budgetUsage?.toFixed(1)}%</span>
                      </div>
                      <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(data.budgetUsage || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Slide 2: Top Categories */}
              <div
                className={`transition-all duration-500 ${
                  currentSlide === 2
                    ? "opacity-100 translate-x-0"
                    : currentSlide > 2
                    ? "opacity-0 -translate-x-full absolute inset-0"
                    : "opacity-0 translate-x-full absolute inset-0"
                }`}
              >
                <div className="flex flex-col items-center justify-center min-h-[400px] text-white">
                  <p className="text-lg opacity-80 mb-6 text-center">{t("topCategories")}</p>
                  <div className="w-full space-y-3">
                    {data.topCategories.map((cat, index) => (
                      <div
                        key={cat.name}
                        className="flex items-center gap-3"
                        style={{
                          animation: currentSlide === 2 ? `slideIn 0.5s ease-out ${index * 0.1}s both` : undefined,
                        }}
                      >
                        <span className="w-6 text-center font-bold opacity-60">{index + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="font-medium">{translateCategory(cat.name)}</span>
                            <span className="opacity-80">€{cat.total.toFixed(2)}</span>
                          </div>
                          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white rounded-full transition-all duration-700"
                              style={{
                                width: currentSlide === 2 ? `${cat.percentage}%` : "0%",
                                transitionDelay: `${index * 100}ms`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Slide 3: Timeline */}
              <div
                className={`transition-all duration-500 ${
                  currentSlide === 3
                    ? "opacity-100 translate-x-0"
                    : currentSlide > 3
                    ? "opacity-0 -translate-x-full absolute inset-0"
                    : "opacity-0 translate-x-full absolute inset-0"
                }`}
              >
                <div className="flex flex-col items-center justify-center min-h-[400px] text-white">
                  <p className="text-lg opacity-80 mb-6 text-center">{t("spendingTimeline")}</p>
                  <div className="w-full flex items-end justify-center gap-2 h-48">
                    {data.monthlyBreakdown.map((month, index) => {
                      const heightPercent = maxMonthlyTotal > 0 ? (month.total / maxMonthlyTotal) * 100 : 0;
                      return (
                        <div
                          key={month.month}
                          className="flex flex-col items-center flex-1 max-w-[60px]"
                        >
                          <div
                            className="w-full bg-white/30 rounded-t-lg transition-all duration-700 relative group"
                            style={{
                              height: currentSlide === 3 ? `${Math.max(heightPercent, 8)}%` : "0%",
                              transitionDelay: `${index * 100}ms`,
                            }}
                          >
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white/20 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              €{month.total.toFixed(0)}
                            </div>
                          </div>
                          <span className="text-xs mt-2 opacity-60 whitespace-nowrap">
                            {month.month.split(" ")[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Slide 4: Summary */}
              <div
                className={`transition-all duration-500 ${
                  currentSlide === 4
                    ? "opacity-100 translate-x-0"
                    : currentSlide > 4
                    ? "opacity-0 -translate-x-full absolute inset-0"
                    : "opacity-0 translate-x-full absolute inset-0"
                }`}
              >
                <div className="flex flex-col items-center justify-center min-h-[400px] text-white">
                  <p className="text-lg opacity-80 mb-6 text-center">{t("summary")}</p>
                  <div className="w-full space-y-4">
                    <div className="bg-white/10 rounded-xl p-4 flex items-center justify-between">
                      <span className="opacity-80">{t("expenseCount")}</span>
                      <span className="text-2xl font-bold">{data.expenseCount}</span>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 flex items-center justify-between">
                      <span className="opacity-80">{t("averageExpense")}</span>
                      <span className="text-2xl font-bold">€{data.averageExpense.toFixed(2)}</span>
                    </div>
                    {data.highestExpense && (
                      <div className="bg-white/10 rounded-xl p-4">
                        <p className="opacity-80 mb-2">{t("highestExpense")}</p>
                        <p className="text-xl font-bold">{data.highestExpense.name}</p>
                        <p className="text-2xl font-bold">€{data.highestExpense.amount.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        {!isLoading && data && data.expenseCount > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/30 to-transparent">
            {/* Progress dots */}
            <div className="flex justify-center gap-2 mb-4">
              {Array.from({ length: totalSlides }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSlideDirection(index > currentSlide ? "next" : "prev");
                    setCurrentSlide(index);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentSlide
                      ? "bg-white w-6"
                      : "bg-white/40 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex justify-between">
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  currentSlide === 0
                    ? "opacity-0 pointer-events-none"
                    : "bg-white/20 hover:bg-white/30 text-white"
                }`}
              >
                {tCommon("back")}
              </button>
              <button
                onClick={nextSlide}
                className="px-6 py-2 rounded-[14px] bg-white font-semibold hover:bg-white/90 transition-colors"
                style={{ color: "var(--accent)" }}
              >
                {currentSlide === totalSlides - 1 ? t("done") : tCommon("next")}
              </button>
            </div>
          </div>
        )}

        {/* Animation keyframes */}
        <style jsx>{`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
