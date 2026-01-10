import { prisma } from "@/lib/db";

type SupportedLanguage = "en" | "pt-PT" | "fr-FR";

// Default categories with translations for all supported languages
// These cover the most common expense types users need
const DEFAULT_CATEGORY_TRANSLATIONS: Record<
  string,
  { icon: string; translations: Record<SupportedLanguage, string> }
> = {
  // Essentials
  groceries: {
    icon: "🛒",
    translations: { en: "Groceries", "pt-PT": "Mercearia", "fr-FR": "Courses" },
  },
  utilities: {
    icon: "💡",
    translations: { en: "Utilities", "pt-PT": "Serviços", "fr-FR": "Services" },
  },
  rent: {
    icon: "🏠",
    translations: { en: "Rent", "pt-PT": "Renda", "fr-FR": "Loyer" },
  },
  transport: {
    icon: "🚗",
    translations: { en: "Transport", "pt-PT": "Transporte", "fr-FR": "Transport" },
  },
  health: {
    icon: "💊",
    translations: { en: "Health", "pt-PT": "Saúde", "fr-FR": "Santé" },
  },
  insurance: {
    icon: "🛡️",
    translations: { en: "Insurance", "pt-PT": "Seguros", "fr-FR": "Assurance" },
  },

  // Lifestyle
  dining: {
    icon: "🍽️",
    translations: { en: "Dining", "pt-PT": "Restaurantes", "fr-FR": "Restaurants" },
  },
  entertainment: {
    icon: "🎬",
    translations: { en: "Entertainment", "pt-PT": "Entretenimento", "fr-FR": "Divertissement" },
  },
  shopping: {
    icon: "🛍️",
    translations: { en: "Shopping", "pt-PT": "Compras", "fr-FR": "Shopping" },
  },
  subscriptions: {
    icon: "📺",
    translations: { en: "Subscriptions", "pt-PT": "Subscrições", "fr-FR": "Abonnements" },
  },

  // Other common
  education: {
    icon: "📚",
    translations: { en: "Education", "pt-PT": "Educação", "fr-FR": "Éducation" },
  },
  travel: {
    icon: "✈️",
    translations: { en: "Travel", "pt-PT": "Viagens", "fr-FR": "Voyages" },
  },
  personalCare: {
    icon: "💇",
    translations: { en: "Personal Care", "pt-PT": "Cuidados Pessoais", "fr-FR": "Soins Personnels" },
  },
  gifts: {
    icon: "🎁",
    translations: { en: "Gifts", "pt-PT": "Presentes", "fr-FR": "Cadeaux" },
  },
  pets: {
    icon: "🐾",
    translations: { en: "Pets", "pt-PT": "Animais", "fr-FR": "Animaux" },
  },
};

/**
 * Get default categories for a specific language
 */
export function getDefaultCategories(language: string = "en") {
  const lang = (["en", "pt-PT", "fr-FR"].includes(language) ? language : "en") as SupportedLanguage;

  return Object.values(DEFAULT_CATEGORY_TRANSLATIONS).map((cat) => ({
    name: cat.translations[lang],
    icon: cat.icon,
  }));
}

// Legacy export for backward compatibility (English names)
export const DEFAULT_CATEGORIES = getDefaultCategories("en");

/**
 * Seeds default categories for a workspace, skipping any that already exist.
 * This is safe to run multiple times - it won't create duplicates.
 *
 * @param workspaceId - The workspace to seed categories for
 * @param language - The language for category names (defaults to workspace language or 'en')
 * @returns Object with counts of created and skipped categories
 */
export async function seedDefaultCategories(
  workspaceId: string,
  language?: string
): Promise<{
  created: number;
  skipped: number;
  categories: string[];
}> {
  // If no language provided, fetch from workspace
  let lang = language;
  if (!lang) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { language: true },
    });
    lang = workspace?.language || "en";
  }

  const defaultCategories = getDefaultCategories(lang);

  // Get existing category names for this workspace (case-insensitive)
  const existingCategories = await prisma.category.findMany({
    where: { workspaceId },
    select: { name: true },
  });

  const existingNames = new Set(
    existingCategories.map((c) => c.name.toLowerCase())
  );

  // Filter to only categories that don't exist yet
  const categoriesToCreate = defaultCategories.filter(
    (cat) => !existingNames.has(cat.name.toLowerCase())
  );

  // Create missing categories
  if (categoriesToCreate.length > 0) {
    await prisma.category.createMany({
      data: categoriesToCreate.map((cat) => ({
        workspaceId,
        name: cat.name,
        icon: cat.icon,
        isSystem: true, // Mark as system so they appear first in lists
      })),
    });
  }

  return {
    created: categoriesToCreate.length,
    skipped: defaultCategories.length - categoriesToCreate.length,
    categories: categoriesToCreate.map((c) => c.name),
  };
}

// Translations for the "Uncategorized" category
const UNCATEGORIZED_TRANSLATIONS: Record<SupportedLanguage, string> = {
  en: "Uncategorized",
  "pt-PT": "Sem Categoria",
  "fr-FR": "Non Catégorisé",
};

/**
 * Get the translated name for "Uncategorized"
 */
export function getUncategorizedName(language: string = "en"): string {
  const lang = (["en", "pt-PT", "fr-FR"].includes(language) ? language : "en") as SupportedLanguage;
  return UNCATEGORIZED_TRANSLATIONS[lang];
}

/**
 * Ensures the "Uncategorized" category exists for a workspace.
 * Creates it if missing.
 */
export async function ensureUncategorizedCategory(
  workspaceId: string,
  language?: string
): Promise<string> {
  // If no language provided, fetch from workspace
  let lang = language;
  if (!lang) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { language: true },
    });
    lang = workspace?.language || "en";
  }

  const uncategorizedName = getUncategorizedName(lang);

  // Check for any existing "Uncategorized" category (any language)
  let uncategorized = await prisma.category.findFirst({
    where: {
      workspaceId,
      OR: [
        { name: "Uncategorized" },
        { name: "Sem Categoria" },
        { name: "Non Catégorisé" },
      ],
    },
  });

  if (!uncategorized) {
    uncategorized = await prisma.category.create({
      data: {
        workspaceId,
        name: uncategorizedName,
        isSystem: true,
      },
    });
  }

  return uncategorized.id;
}
