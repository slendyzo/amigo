"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Sparkles, Bug, Zap } from "lucide-react";

// Changelog entries - add new entries at the top
const CHANGELOG_ENTRIES = [
  {
    version: "0.2.0",
    date: "2026-01-10",
    entries: [
      {
        type: "feature" as const,
        title: {
          en: "Offline Support",
          "pt-PT": "Suporte Offline",
          "fr-FR": "Support Hors Ligne",
        },
        description: {
          en: "Add expenses even when you're offline. They'll sync automatically when you're back online.",
          "pt-PT": "Adiciona despesas mesmo offline. Serão sincronizadas automaticamente quando voltares online.",
          "fr-FR": "Ajoutez des dépenses même hors ligne. Elles seront synchronisées automatiquement.",
        },
      },
      {
        type: "feature" as const,
        title: {
          en: "Category Breakdown Chart",
          "pt-PT": "Gráfico por Categoria",
          "fr-FR": "Graphique par Catégorie",
        },
        description: {
          en: "See your spending breakdown by category with a new visual chart on the dashboard.",
          "pt-PT": "Vê as tuas despesas por categoria com um novo gráfico no painel.",
          "fr-FR": "Visualisez vos dépenses par catégorie avec un nouveau graphique.",
        },
      },
      {
        type: "fix" as const,
        title: {
          en: "Faster Image Uploads",
          "pt-PT": "Upload de Imagens Mais Rápido",
          "fr-FR": "Téléchargement d'Images Plus Rapide",
        },
        description: {
          en: "Fixed slow image uploads in feedback - images now upload in parallel.",
          "pt-PT": "Corrigido upload lento de imagens no feedback - agora em paralelo.",
          "fr-FR": "Correction du téléchargement lent des images - maintenant en parallèle.",
        },
      },
      {
        type: "fix" as const,
        title: {
          en: "Project Tags in Quick Add",
          "pt-PT": "Tags de Projetos no Quick Add",
          "fr-FR": "Tags de Projets dans Quick Add",
        },
        description: {
          en: "Fixed project tags not loading when adding expenses from the dashboard.",
          "pt-PT": "Corrigido tags de projetos que não carregavam ao adicionar despesas.",
          "fr-FR": "Correction des tags de projets qui ne se chargeaient pas.",
        },
      },
    ],
  },
];

// Current version to check against
const CURRENT_VERSION = "0.2.0";
const STORAGE_KEY = "amigo-last-seen-version";

type ChangelogModalProps = {
  forceOpen?: boolean;
  onClose?: () => void;
};

export function ChangelogModal({ forceOpen, onClose }: ChangelogModalProps) {
  const t = useTranslations("changelog");
  const [isOpen, setIsOpen] = useState(false);
  const [locale, setLocale] = useState<"en" | "pt-PT" | "fr-FR">("en");

  useEffect(() => {
    // Get locale from document
    const docLocale = document.documentElement.lang as "en" | "pt-PT" | "fr-FR";
    if (docLocale) setLocale(docLocale);

    // Check if user has seen this version
    if (forceOpen) {
      setIsOpen(true);
      return;
    }

    const lastSeenVersion = localStorage.getItem(STORAGE_KEY);
    if (lastSeenVersion !== CURRENT_VERSION) {
      // Wait a bit before showing to not overwhelm user immediately
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [forceOpen]);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    setIsOpen(false);
    onClose?.();
  };

  if (!isOpen) return null;

  const currentChangelog = CHANGELOG_ENTRIES[0];

  const getIcon = (type: "feature" | "fix" | "improvement") => {
    switch (type) {
      case "feature":
        return <Sparkles className="w-4 h-4 text-purple-500" />;
      case "fix":
        return <Bug className="w-4 h-4 text-green-500" />;
      case "improvement":
        return <Zap className="w-4 h-4 text-amber-500" />;
    }
  };

  const getTypeLabel = (type: "feature" | "fix" | "improvement") => {
    const labels = {
      feature: { en: "New", "pt-PT": "Novo", "fr-FR": "Nouveau" },
      fix: { en: "Fix", "pt-PT": "Correção", "fr-FR": "Correction" },
      improvement: { en: "Improved", "pt-PT": "Melhorado", "fr-FR": "Amélioré" },
    };
    return labels[type][locale] || labels[type].en;
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#0070f3] to-purple-600 px-6 py-8 text-white">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-xl font-bold">{t("title")}</h2>
          </div>
          <p className="text-white/80 text-sm">
            {t("version", { version: currentChangelog.version })} · {new Date(currentChangelog.date).toLocaleDateString(locale === "en" ? "en-GB" : locale)}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-80 overflow-y-auto">
          <div className="space-y-4">
            {currentChangelog.entries.map((entry, index) => (
              <div key={index} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(entry.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {entry.title[locale] || entry.title.en}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        entry.type === "feature"
                          ? "bg-purple-100 text-purple-700"
                          : entry.type === "fix"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {getTypeLabel(entry.type)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {entry.description[locale] || entry.description.en}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200">
          <button
            onClick={handleClose}
            className="w-full py-2.5 bg-[#0070f3] text-white font-medium rounded-lg hover:bg-[#0060df] transition-colors"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
