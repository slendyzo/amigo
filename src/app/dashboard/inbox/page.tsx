"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type FeedbackItem = {
  id: string;
  type: "BUG" | "FEATURE";
  message: string;
  pageUrl: string | null;
  userAgent: string | null;
  imageUrl: string | null;
  imageUrls: string | null; // JSON array of image URLs
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

// Helper to get all images from a feedback item (supports both legacy and new format)
function getImageUrls(item: FeedbackItem): string[] {
  // Try new format first (JSON array)
  if (item.imageUrls) {
    try {
      const parsed = JSON.parse(item.imageUrls);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Invalid JSON, fall through to legacy
    }
  }
  // Fall back to legacy single image
  if (item.imageUrl) {
    return [item.imageUrl];
  }
  return [];
}

export default function InboxPage() {
  const t = useTranslations("admin");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "BUG" | "FEATURE" | "unread">("all");
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedback();
  }, [filter]);

  const fetchFeedback = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "BUG" || filter === "FEATURE") {
        params.set("type", filter);
      } else if (filter === "unread") {
        params.set("unread", "true");
      }

      const response = await fetch(`/api/feedback?${params}`);
      if (!response.ok) {
        if (response.status === 403) {
          setError("You don't have access to this page.");
          return;
        }
        throw new Error("Failed to fetch");
      }

      const data = await response.json();
      setFeedback(data.feedback);
      setUnreadCount(data.unreadCount);
    } catch {
      setError("Failed to load feedback");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string, isRead: boolean) => {
    try {
      const response = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isRead }),
      });

      if (response.ok) {
        setFeedback((prev) =>
          prev.map((f) => (f.id === id ? { ...f, isRead } : f))
        );
        setUnreadCount((prev) => (isRead ? prev - 1 : prev + 1));
      }
    } catch {
      // Silently fail
    }
  };

  const handleMarkAsResolved = async (id: string, isResolved: boolean) => {
    try {
      const response = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isResolved, isRead: true }),
      });

      if (response.ok) {
        setFeedback((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, isResolved, isRead: true } : f
          )
        );
      }
    } catch {
      // Silently fail
    }
  };

  const handleResolveAll = async () => {
    const unresolvedCount = feedback.filter((f) => !f.isResolved).length;
    if (unresolvedCount === 0) return;
    if (!confirm(`Mark all ${unresolvedCount} unresolved items as resolved?`)) return;

    try {
      const response = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolveAll: true }),
      });

      if (response.ok) {
        setFeedback((prev) =>
          prev.map((f) => ({ ...f, isResolved: true, isRead: true }))
        );
        setUnreadCount(0);
      }
    } catch {
      // Silently fail
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this feedback?")) return;

    try {
      const response = await fetch(`/api/feedback?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const deletedItem = feedback.find((f) => f.id === id);
        setFeedback((prev) => prev.filter((f) => f.id !== id));
        if (deletedItem && !deletedItem.isRead) {
          setUnreadCount((prev) => prev - 1);
        }
      }
    } catch {
      // Silently fail
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (error === "You don't have access to this page.") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--ink)]">{t("feedbackInbox")}</h1>
        <div
          className="rounded-[20px] p-6 text-center border"
          style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-card)" }}
        >
          <p className="text-[var(--negative)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">{t("feedbackInbox")}</h1>
          {unreadCount > 0 && (
            <p className="text-[var(--ink-muted)] text-sm mt-1">
              {unreadCount} {t("unread").toLowerCase()}
            </p>
          )}
        </div>
        {feedback.some((f) => !f.isResolved) && (
          <button
            onClick={handleResolveAll}
            className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors text-[var(--positive)]"
            style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}
          >
            {t("resolveAll")}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "unread", "BUG", "FEATURE"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--surface-3)]"
            }`}
          >
            {f === "all" && t("allFeedback")}
            {f === "unread" && (
              <>
                {t("unread")}
                {unreadCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-[var(--accent)] text-[var(--accent-fg)] rounded-full tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </>
            )}
            {f === "BUG" && t("bugs")}
            {f === "FEATURE" && t("features")}
          </button>
        ))}
      </div>

      {/* Feedback List */}
      {isLoading ? (
        <div
          className="rounded-[20px] p-8 text-center text-[var(--ink-muted)] border"
          style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-card)" }}
        >
          Loading...
        </div>
      ) : feedback.length === 0 ? (
        <div
          className="rounded-[20px] p-8 text-center text-[var(--ink-muted)] border"
          style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-card)" }}
        >
          {t("noFeedback")}
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <div
              key={item.id}
              className={`rounded-[20px] border overflow-hidden transition-all ${item.isResolved ? "opacity-60" : ""}`}
              style={{
                background: item.isRead ? "var(--surface)" : "var(--accent-faint)",
                borderColor: item.isRead ? "var(--line)" : "var(--accent-soft)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Type Badge */}
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={
                      item.type === "BUG"
                        ? { background: "color-mix(in srgb, var(--negative) 14%, transparent)", color: "var(--negative)" }
                        : { background: "var(--accent-tint)", color: "var(--accent-strong)" }
                    }
                  >
                    {item.type === "BUG" ? t("bugs") : t("features")}
                  </span>

                  {/* Resolved badge */}
                  {item.isResolved && (
                    <span
                      className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ background: "color-mix(in srgb, var(--positive) 14%, transparent)", color: "var(--positive)" }}
                    >
                      Resolved
                    </span>
                  )}

                  {/* Unread indicator */}
                  {!item.isRead && (
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  )}
                </div>

                <span className="text-xs text-[var(--ink-muted)]">
                  {formatDate(item.createdAt)}
                </span>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <p className="text-[var(--ink)] whitespace-pre-wrap">{item.message}</p>

                {/* Screenshots - supports multiple images */}
                {getImageUrls(item).length > 0 && (
                  <div className="mt-3">
                    <div className={`grid gap-2 ${getImageUrls(item).length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>
                      {getImageUrls(item).map((imgUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLightboxImage(imgUrl)}
                          className="block text-left"
                        >
                          <img
                            src={imgUrl}
                            alt={`Screenshot ${idx + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-[var(--line)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                          />
                        </button>
                      ))}
                    </div>
                    {getImageUrls(item).length > 1 && (
                      <p className="text-xs text-[var(--ink-subtle)] mt-1">
                        {getImageUrls(item).length} images attached
                      </p>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-4 text-xs text-[var(--ink-muted)]">
                  {item.user && (
                    <span>
                      <strong>{t("from")}:</strong> {item.user.name || item.user.email}
                    </span>
                  )}
                  {item.pageUrl && (
                    <span>
                      <strong>{t("page")}:</strong> {item.pageUrl}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t border-[var(--line)] flex gap-2 flex-wrap" style={{ background: "var(--surface-2)" }}>
                <button
                  onClick={() => handleMarkAsRead(item.id, !item.isRead)}
                  className="px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] border border-[var(--line)] rounded-lg transition-colors"
                  style={{ background: "var(--surface)" }}
                >
                  {item.isRead ? t("markAsUnread") : t("markAsRead")}
                </button>

                {!item.isResolved && (
                  <button
                    onClick={() => handleMarkAsResolved(item.id, true)}
                    className="px-3 py-1.5 text-xs font-medium text-[var(--positive)] border border-[var(--line)] rounded-lg transition-colors"
                    style={{ background: "var(--surface)" }}
                  >
                    {t("markAsResolved")}
                  </button>
                )}

                <button
                  onClick={() => handleDelete(item.id)}
                  className="px-3 py-1.5 text-xs font-medium text-[var(--negative)] border border-[var(--line)] rounded-lg transition-colors"
                  style={{ background: "var(--surface)" }}
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxImage}
            alt="Screenshot full size"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
