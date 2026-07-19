import { prisma } from "@/lib/db";

import {
  DEFAULT_CATEGORY_HIERARCHY,
  LEGACY_CATEGORY_MIGRATION,
  type ParentCategoryDef,
  type SubcategoryDef,
  type SupportedLanguage,
} from "@/lib/category-hierarchy";

// The tree itself lives in category-hierarchy.ts (Prisma-free) so client
// components can use it; re-exported here for existing importers.
export { DEFAULT_CATEGORY_HIERARCHY, LEGACY_CATEGORY_MIGRATION };
export type { ParentCategoryDef, SubcategoryDef, SupportedLanguage };


/**
 * Get default categories for a specific language (flat list for backward compat)
 */
export function getDefaultCategories(language: string = "en") {
  const lang = (["en", "pt-PT", "fr-FR"].includes(language) ? language : "en") as SupportedLanguage;

  const result: { name: string; icon: string }[] = [];
  for (const parent of DEFAULT_CATEGORY_HIERARCHY) {
    if (parent.children.length === 0) {
      // Flat parent (like Gifts & Donations) - include as leaf
      result.push({ name: parent.translations[lang], icon: parent.icon });
    } else {
      for (const child of parent.children) {
        result.push({ name: child.translations[lang], icon: child.icon });
      }
    }
  }
  return result;
}

// Legacy export for backward compatibility
export const DEFAULT_CATEGORIES = getDefaultCategories("en");

/**
 * Seeds default categories with hierarchy for a workspace.
 * Creates parent categories and their children.
 * Safe to run multiple times - skips existing names.
 */
export async function seedDefaultCategories(
  workspaceId: string,
  language?: string
): Promise<{
  created: number;
  skipped: number;
  categories: string[];
}> {
  let lang = language;
  if (!lang) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { language: true },
    });
    lang = workspace?.language || "en";
  }

  const safeLang = (["en", "pt-PT", "fr-FR"].includes(lang) ? lang : "en") as SupportedLanguage;

  // Get existing category names
  const existingCategories = await prisma.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
  });
  const existingNames = new Map(
    existingCategories.map((c) => [c.name.toLowerCase(), c.id])
  );

  let created = 0;
  const createdNames: string[] = [];

  for (const parentDef of DEFAULT_CATEGORY_HIERARCHY) {
    const parentName = parentDef.translations[safeLang];

    // Create or find parent
    let parentId: string;
    if (existingNames.has(parentName.toLowerCase())) {
      parentId = existingNames.get(parentName.toLowerCase())!;
    } else {
      const parent = await prisma.category.create({
        data: {
          workspaceId,
          name: parentName,
          icon: parentDef.icon,
          color: parentDef.color,
          isSystem: true,
          parentId: null,
        },
      });
      parentId = parent.id;
      existingNames.set(parentName.toLowerCase(), parentId);
      created++;
      createdNames.push(parentName);
    }

    // Create children under parent
    for (const childDef of parentDef.children) {
      const childName = childDef.translations[safeLang];
      if (!existingNames.has(childName.toLowerCase())) {
        const child = await prisma.category.create({
          data: {
            workspaceId,
            name: childName,
            icon: childDef.icon,
            isSystem: true,
            parentId,
          },
        });
        existingNames.set(childName.toLowerCase(), child.id);
        created++;
        createdNames.push(childName);
      }
    }
  }

  return {
    created,
    skipped: 0,
    categories: createdNames,
  };
}

/**
 * Upgrades existing flat categories to hierarchical structure.
 * Adopts existing categories as children of new parents where they match.
 * Idempotent - safe to run multiple times.
 */
/**
 * Normalize a string for fuzzy comparison: lowercase, strip accents, trim.
 */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Simple fuzzy match: returns true if strings are similar enough.
 * Checks substring containment and word overlap.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);

  // Exact match after normalization
  if (na === nb) return true;

  // One is a substring of the other (e.g. "Restaurante" in "Restaurantes")
  if (na.length >= 3 && nb.length >= 3) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }

  // Word overlap: split into words, check if significant words overlap
  const wordsA = na.split(/[\s&/,>]+/).filter((w) => w.length > 2);
  const wordsB = nb.split(/[\s&/,>]+/).filter((w) => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const overlap = wordsA.filter((wa) =>
    wordsB.some((wb) => wa.includes(wb) || wb.includes(wa))
  ).length;
  const maxLen = Math.max(wordsA.length, wordsB.length);

  // At least half of the significant words overlap
  return overlap / maxLen >= 0.5;
}

export async function upgradeToHierarchy(
  workspaceId: string,
  language?: string
): Promise<{
  parentsCreated: number;
  childrenCreated: number;
  adopted: number;
  merged: number;
  unmatched: string[];
}> {
  let lang = language;
  if (!lang) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { language: true },
    });
    lang = workspace?.language || "en";
  }

  const safeLang = (["en", "pt-PT", "fr-FR"].includes(lang) ? lang : "en") as SupportedLanguage;

  // Get all existing categories
  const existing = await prisma.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true, parentId: true },
  });
  const existingByName = new Map(
    existing.map((c) => [c.name.toLowerCase(), c])
  );

  let parentsCreated = 0;
  let childrenCreated = 0;
  let adopted = 0;
  let merged = 0;

  // Build a lookup: subcategory key -> parentDef
  const childKeyToParent = new Map<string, ParentCategoryDef>();
  for (const parentDef of DEFAULT_CATEGORY_HIERARCHY) {
    for (const childDef of parentDef.children) {
      childKeyToParent.set(childDef.key, parentDef);
    }
  }

  for (const parentDef of DEFAULT_CATEGORY_HIERARCHY) {
    const parentName = parentDef.translations[safeLang];

    // Create or find parent category
    let parentId: string;
    const existingParent = existingByName.get(parentName.toLowerCase());
    if (existingParent) {
      parentId = existingParent.id;
      // Ensure it has no parentId (it's a top-level)
      if (existingParent.parentId !== null) {
        await prisma.category.update({
          where: { id: parentId },
          data: { parentId: null, icon: parentDef.icon, color: parentDef.color },
        });
      }
    } else {
      const parent = await prisma.category.create({
        data: {
          workspaceId,
          name: parentName,
          icon: parentDef.icon,
          color: parentDef.color,
          isSystem: true,
          parentId: null,
        },
      });
      parentId = parent.id;
      existingByName.set(parentName.toLowerCase(), { id: parentId, name: parentName, parentId: null });
      parentsCreated++;
    }

    // Process children
    for (const childDef of parentDef.children) {
      const childName = childDef.translations[safeLang];
      const existingChild = existingByName.get(childName.toLowerCase());

      if (existingChild) {
        // Adopt: set parentId if not already set
        if (existingChild.parentId === null) {
          await prisma.category.update({
            where: { id: existingChild.id },
            data: { parentId, icon: childDef.icon },
          });
          adopted++;
        }
      } else {
        // Create new child
        const child = await prisma.category.create({
          data: {
            workspaceId,
            name: childName,
            icon: childDef.icon,
            isSystem: true,
            parentId,
          },
        });
        existingByName.set(childName.toLowerCase(), { id: child.id, name: childName, parentId });
        childrenCreated++;
      }
    }
  }

  // Build a lookup: subcategory key -> child definition
  const childKeyToDef = new Map<string, SubcategoryDef>();
  for (const parentDef of DEFAULT_CATEGORY_HIERARCHY) {
    for (const childDef of parentDef.children) {
      childKeyToDef.set(childDef.key, childDef);
    }
  }

  // Merge or adopt existing flat categories that match legacy names
  // Re-fetch to get current state after parent/child creation above
  const currentCategories = await prisma.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true, parentId: true },
  });
  const currentByName = new Map(
    currentCategories.map((c) => [c.name.toLowerCase(), c])
  );

  for (const cat of currentCategories) {
    if (cat.parentId !== null) continue; // Already organized
    const legacyKey = LEGACY_CATEGORY_MIGRATION[cat.name];
    if (!legacyKey) continue;

    // Find which parent this key belongs to
    const parentDef = childKeyToParent.get(legacyKey);
    if (!parentDef) {
      // Key maps to a flat parent (e.g. gifts_donations) - find it directly
      const flatParent = DEFAULT_CATEGORY_HIERARCHY.find((p) => p.key === legacyKey);
      if (!flatParent) continue;
      const flatParentName = flatParent.translations[safeLang];
      const targetParent = currentByName.get(flatParentName.toLowerCase());
      if (!targetParent || targetParent.id === cat.id) continue;

      // Merge: reassign all relations from old category to the parent
      await prisma.expense.updateMany({
        where: { categoryId: cat.id },
        data: { categoryId: targetParent.id },
      });
      await prisma.recurringTemplate.updateMany({
        where: { categoryId: cat.id },
        data: { categoryId: targetParent.id },
      });
      await prisma.keywordMapping.updateMany({
        where: { categoryId: cat.id },
        data: { categoryId: targetParent.id },
      });
      await prisma.category.delete({ where: { id: cat.id } });
      merged++;
      continue;
    }

    const parentName = parentDef.translations[safeLang];
    const parent = currentByName.get(parentName.toLowerCase());
    if (!parent) continue;

    // Don't merge if the category is itself a parent now
    if (parent.id === cat.id) continue;

    // Find the target subcategory name for this key
    const childDef = childKeyToDef.get(legacyKey);
    if (!childDef) continue;
    const targetName = childDef.translations[safeLang];
    const targetCategory = currentByName.get(targetName.toLowerCase());

    if (targetCategory && targetCategory.id !== cat.id) {
      // Target subcategory exists and is different - MERGE
      // Reassign all expenses, templates, and mappings to the target
      await prisma.expense.updateMany({
        where: { categoryId: cat.id },
        data: { categoryId: targetCategory.id },
      });
      await prisma.recurringTemplate.updateMany({
        where: { categoryId: cat.id },
        data: { categoryId: targetCategory.id },
      });
      await prisma.keywordMapping.updateMany({
        where: { categoryId: cat.id },
        data: { categoryId: targetCategory.id },
      });
      // Delete the old category
      await prisma.category.delete({ where: { id: cat.id } });
      merged++;
    } else {
      // Old category IS the target (same name) - just adopt under parent
      await prisma.category.update({
        where: { id: cat.id },
        data: { parentId: parent.id },
      });
      adopted++;
    }
  }

  // Fuzzy match pass: try to match remaining orphans to subcategories
  const afterMerge = await prisma.category.findMany({
    where: { workspaceId, parentId: null },
    select: { id: true, name: true },
  });

  const uncategorizedNames = ["uncategorized", "sem categoria", "non catégorisé"];
  const isParentName = (name: string) =>
    DEFAULT_CATEGORY_HIERARCHY.some((p) =>
      Object.values(p.translations).some((t) => t.toLowerCase() === name.toLowerCase())
    );

  // Build a flat list of all subcategories with their parent IDs for fuzzy matching
  const allSubcategories: { name: string; parentId: string; id: string }[] = [];
  const finalCategories = await prisma.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true, parentId: true },
  });
  for (const c of finalCategories) {
    if (c.parentId !== null) {
      allSubcategories.push({ name: c.name, parentId: c.parentId, id: c.id });
    }
  }

  const unmatched: string[] = [];

  for (const orphan of afterMerge) {
    // Skip Uncategorized and parent categories
    if (uncategorizedNames.includes(orphan.name.toLowerCase())) continue;
    if (isParentName(orphan.name)) continue;

    // Try fuzzy match against all subcategory names (all languages)
    let bestMatch: { subcatId: string; parentId: string } | null = null;

    // First try matching against the default hierarchy definitions (all translations)
    for (const parentDef of DEFAULT_CATEGORY_HIERARCHY) {
      for (const childDef of parentDef.children) {
        const matchesAnyLang = Object.values(childDef.translations).some((t) =>
          fuzzyMatch(orphan.name, t)
        );
        if (matchesAnyLang) {
          // Find the actual subcategory and parent in the DB
          const childName = childDef.translations[safeLang];
          const subcat = allSubcategories.find(
            (s) => s.name.toLowerCase() === childName.toLowerCase()
          );
          if (subcat) {
            bestMatch = { subcatId: subcat.id, parentId: subcat.parentId };
            break;
          }
        }
      }
      if (bestMatch) break;
    }

    if (bestMatch) {
      // Merge into the matched subcategory
      await prisma.expense.updateMany({
        where: { categoryId: orphan.id },
        data: { categoryId: bestMatch.subcatId },
      });
      await prisma.recurringTemplate.updateMany({
        where: { categoryId: orphan.id },
        data: { categoryId: bestMatch.subcatId },
      });
      await prisma.keywordMapping.updateMany({
        where: { categoryId: orphan.id },
        data: { categoryId: bestMatch.subcatId },
      });
      await prisma.category.delete({ where: { id: orphan.id } });
      merged++;
    } else {
      unmatched.push(orphan.name);
    }
  }

  return { parentsCreated, childrenCreated, adopted, merged, unmatched };
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
  let lang = language;
  if (!lang) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { language: true },
    });
    lang = workspace?.language || "en";
  }

  const uncategorizedName = getUncategorizedName(lang);

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
