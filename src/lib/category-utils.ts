/**
 * Utility functions for working with hierarchical categories
 */

export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string | null;
  color?: string | null;
  isSystem?: boolean;
  children: CategoryNode[];
  _count?: { expenses: number };
};

export type FlatCategory = {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string | null;
  color?: string | null;
  isSystem?: boolean;
  _count?: { expenses: number };
};

/**
 * Converts a flat list of categories (with parentId) into a nested tree.
 * Top-level items have parentId === null.
 */
export function buildCategoryTree(categories: FlatCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  // Create nodes for all categories
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  // Build tree relationships
  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort parents and children alphabetically by name
  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of roots) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
  }

  return roots;
}

/**
 * Returns only leaf categories (categories that can have expenses assigned).
 * - If a parent has children, the children are the leaves
 * - If a parent has no children (flat category), the parent itself is a leaf
 */
export function getLeafCategories(categories: FlatCategory[]): FlatCategory[] {
  const parentIds = new Set(
    categories.filter((c) => c.parentId === null && categories.some((ch) => ch.parentId === c.id)).map((c) => c.id)
  );
  return categories.filter((c) => !parentIds.has(c.id));
}

/**
 * Returns "Parent > Child" display string for a category.
 * If the category has no parent, returns just the category name.
 */
export function getCategoryPath(
  categoryId: string,
  categories: FlatCategory[]
): string {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return "";
  if (!cat.parentId) return cat.name;
  const parent = categories.find((c) => c.id === cat.parentId);
  if (!parent) return cat.name;
  return `${parent.name} > ${cat.name}`;
}

/**
 * Gets the total expense count for a parent category (sum of its own + children's expenses).
 */
export function getParentExpenseCount(parent: CategoryNode): number {
  const own = parent._count?.expenses ?? 0;
  const childTotal = parent.children.reduce(
    (sum, child) => sum + (child._count?.expenses ?? 0),
    0
  );
  return own + childTotal;
}
