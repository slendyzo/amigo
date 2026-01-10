import { prisma } from "@/lib/db";

// Default categories that every workspace should have
// These cover the most common expense types users need
export const DEFAULT_CATEGORIES = [
  // Essentials
  { name: "Groceries", icon: "🛒" },
  { name: "Utilities", icon: "💡" },
  { name: "Rent", icon: "🏠" },
  { name: "Transport", icon: "🚗" },
  { name: "Health", icon: "💊" },
  { name: "Insurance", icon: "🛡️" },

  // Lifestyle
  { name: "Dining", icon: "🍽️" },
  { name: "Entertainment", icon: "🎬" },
  { name: "Shopping", icon: "🛍️" },
  { name: "Subscriptions", icon: "📺" },

  // Other common
  { name: "Education", icon: "📚" },
  { name: "Travel", icon: "✈️" },
  { name: "Personal Care", icon: "💇" },
  { name: "Gifts", icon: "🎁" },
  { name: "Pets", icon: "🐾" },
];

/**
 * Seeds default categories for a workspace, skipping any that already exist.
 * This is safe to run multiple times - it won't create duplicates.
 *
 * @param workspaceId - The workspace to seed categories for
 * @returns Object with counts of created and skipped categories
 */
export async function seedDefaultCategories(workspaceId: string): Promise<{
  created: number;
  skipped: number;
  categories: string[];
}> {
  // Get existing category names for this workspace (case-insensitive)
  const existingCategories = await prisma.category.findMany({
    where: { workspaceId },
    select: { name: true },
  });

  const existingNames = new Set(
    existingCategories.map((c) => c.name.toLowerCase())
  );

  // Filter to only categories that don't exist yet
  const categoriesToCreate = DEFAULT_CATEGORIES.filter(
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
    skipped: DEFAULT_CATEGORIES.length - categoriesToCreate.length,
    categories: categoriesToCreate.map((c) => c.name),
  };
}

/**
 * Ensures the "Uncategorized" category exists for a workspace.
 * Creates it if missing.
 */
export async function ensureUncategorizedCategory(
  workspaceId: string
): Promise<string> {
  let uncategorized = await prisma.category.findFirst({
    where: { workspaceId, name: "Uncategorized" },
  });

  if (!uncategorized) {
    uncategorized = await prisma.category.create({
      data: {
        workspaceId,
        name: "Uncategorized",
        isSystem: true,
      },
    });
  }

  return uncategorized.id;
}
