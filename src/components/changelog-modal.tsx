"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Sparkles, Bug, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

// Changelog entries - add new entries at the top
const CHANGELOG_ENTRIES = [
  {
    version: "0.3.1",
    date: "2026-01-10",
    entries: [
      {
        type: "feature" as const,
        title: {
          en: "Smart Category Learning",
          "pt-PT": "Aprendizagem de Categorias",
          "fr-FR": "Apprentissage des Catégories",
        },
        description: {
          en: "Amigo now learns from your categorizations! After categorizing the same expense 3 times, it will auto-categorize future ones. You'll also see suggestions based on your history.",
          "pt-PT": "O Amigo agora aprende com as tuas categorizações! Após categorizar a mesma despesa 3 vezes, ela será auto-categorizada no futuro. Também verás sugestões baseadas no teu histórico.",
          "fr-FR": "Amigo apprend maintenant de vos catégorisations ! Après avoir catégorisé la même dépense 3 fois, elle sera auto-catégorisée. Vous verrez aussi des suggestions basées sur votre historique.",
        },
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-01-10",
    entries: [
      {
        type: "feature" as const,
        title: {
          en: "Quick Categorize",
          "pt-PT": "Categorizar Rápido",
          "fr-FR": "Catégorisation Rapide",
        },
        description: {
          en: "New page to quickly categorize all your uncategorized expenses. Find it under Categories in the sidebar.",
          "pt-PT": "Nova página para categorizar rapidamente todas as despesas sem categoria. Encontra em Categorias no menu.",
          "fr-FR": "Nouvelle page pour catégoriser rapidement vos dépenses. Trouvez-la dans Catégories dans le menu.",
        },
      },
      {
        type: "improvement" as const,
        title: {
          en: "Changelog History",
          "pt-PT": "Histórico de Alterações",
          "fr-FR": "Historique des Changements",
        },
        description: {
          en: "You can now browse through all past updates using the navigation arrows.",
          "pt-PT": "Agora podes ver todas as atualizações anteriores usando as setas de navegação.",
          "fr-FR": "Vous pouvez maintenant parcourir toutes les mises à jour passées avec les flèches.",
        },
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-01-08",
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
const CURRENT_VERSION = "0.3.1";
const STORAGE_KEY = "amigo-last-seen-version";

type ChangelogModalProps = {
  forceOpen?: boolean;
  onClose?: () => void;
};

export function ChangelogModal({ forceOpen, onClose }: ChangelogModalProps) {
  const t = useTranslations("changelog");
  const [isOpen, setIsOpen] = useState(false);
  const [locale, setLocale] = useState<"en" | "pt-PT" | "fr-FR">("en");
  const [currentIndex, setCurrentIndex] = useState(0);

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
    setCurrentIndex(0);
    onClose?.();
  };

  const handlePrevious = () => {
    if (currentIndex < CHANGELOG_ENTRIES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (!isOpen) return null;

  const currentChangelog = CHANGELOG_ENTRIES[currentIndex];
  const hasPrevious = currentIndex < CHANGELOG_ENTRIES.length - 1;
  const hasNext = currentIndex > 0;

  const getIcon = (type: "feature" | "fix" | "improvement") => {
    switch (type) {
      case "feature":
        return <Sparkles className="w-4 h-4 text-purple-500" />;
      case "fix":
        return <Bug className="w-4 h-4 text-green-500" />;
      case "improvement":
        return <Zap className="w-4 h-4 text-[var(--accent)]" />;
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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="dialog"
      size="md"
      zIndexClassName="z-[70]"
      className="rounded-2xl"
      style={{ background: "var(--surface)" }}
    >
      {/* Header */}
      <ModalHeader showClose={false}>
        <div className="relative bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent)] px-6 py-8 text-white">
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
          <div className="flex items-center justify-between">
            <p className="text-white/80 text-sm">
              {t("version", { version: currentChangelog.version })} · {new Date(currentChangelog.date).toLocaleDateString(locale === "en" ? "en-GB" : locale)}
            </p>
            {CHANGELOG_ENTRIES.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevious}
                  disabled={!hasPrevious}
                  className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title={t("olderUpdates")}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-xs text-white/60 min-w-[3rem] text-center">
                  {currentIndex + 1} / {CHANGELOG_ENTRIES.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={!hasNext}
                  className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title={t("newerUpdates")}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </ModalHeader>

      {/* Content */}
      <ModalBody className="px-6 py-4">
        <div className="space-y-4">
            {currentChangelog.entries.map((entry, index) => (
              <div key={index} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(entry.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--ink)]">
                      {entry.title[locale] || entry.title.en}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        entry.type === "feature"
                          ? "bg-purple-100 text-purple-700"
                          : entry.type === "fix"
                          ? "bg-green-100 text-green-700"
                          : "bg-[var(--accent-tint)] text-[var(--accent-strong)]"
                      }`}
                    >
                      {getTypeLabel(entry.type)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--ink-muted)] mt-0.5">
                    {entry.description[locale] || entry.description.en}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </ModalBody>

      {/* Footer */}
      <ModalFooter className="px-6 pt-4 pb-4 md:px-6 md:pb-4">
        <button
          onClick={handleClose}
          className="w-full py-2.5 bg-[var(--accent)] text-[var(--accent-fg)] font-medium rounded-lg hover:bg-[var(--accent-strong)] transition-colors"
        >
          {t("close")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
