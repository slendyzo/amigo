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
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

export default function InboxPage() {
  const t = useTranslations("admin");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "BUG" | "FEATURE" | "unread">("all");
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (error === "You don't have access to this page.") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t("feedbackInbox")}</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("feedbackInbox")}</h1>
          {unreadCount > 0 && (
            <p className="text-slate-500 text-sm mt-1">
              {unreadCount} {t("unread").toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "unread", "BUG", "FEATURE"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-[#0070f3] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "all" && t("allFeedback")}
            {f === "unread" && (
              <>
                {t("unread")}
                {unreadCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
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
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          Loading...
        </div>
      ) : feedback.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          {t("noFeedback")}
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                item.isRead
                  ? "border-slate-200"
                  : "border-blue-300 bg-blue-50/30"
              } ${item.isResolved ? "opacity-60" : ""}`}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Type Badge */}
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      item.type === "BUG"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {item.type === "BUG" ? t("bugs") : t("features")}
                  </span>

                  {/* Resolved badge */}
                  {item.isResolved && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Resolved
                    </span>
                  )}

                  {/* Unread indicator */}
                  {!item.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>

                <span className="text-xs text-slate-500">
                  {formatDate(item.createdAt)}
                </span>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <p className="text-slate-800 whitespace-pre-wrap">{item.message}</p>

                {/* Screenshot */}
                {item.imageUrl && (
                  <div className="mt-3">
                    <a
                      href={item.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={item.imageUrl}
                        alt="Screenshot"
                        className="max-w-full max-h-64 rounded-lg border border-slate-200 hover:border-blue-400 transition-colors cursor-pointer"
                      />
                    </a>
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
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
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap">
                <button
                  onClick={() => handleMarkAsRead(item.id, !item.isRead)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  {item.isRead ? t("markAsUnread") : t("markAsRead")}
                </button>

                {!item.isResolved && (
                  <button
                    onClick={() => handleMarkAsResolved(item.id, true)}
                    className="px-3 py-1.5 text-xs font-medium text-green-600 bg-white border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    {t("markAsResolved")}
                  </button>
                )}

                <button
                  onClick={() => handleDelete(item.id)}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
