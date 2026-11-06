import type { AuditProduct } from "./scan.server";

export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type Category = "Content" | "Images" | "Catalog" | "Inventory";

type Context = {
  duplicateIds: Set<string>;
  duplicateTitleCounts: Map<string, number>;
};

export type Check = {
  id: string;
  label: string;
  category: Category;
  severity: Severity;
  fails: (product: AuditProduct, ctx: Context) => boolean;
  scope?: "inactive";
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  HIGH: "Critical",
  MEDIUM: "Should fix",
  LOW: "Nice to have",
};

export const CHECK_INFO: Record<string, { slug: string; description: string }> = {
  P1: {
    slug: "missing-description",
    description:
      "Products with no description, or one under 50 characters. A description helps shoppers decide and gives search engines text to index.",
  },
  P2: {
    slug: "no-images",
    description: "Products with no images. Shoppers rarely buy what they cannot see.",
  },
  P3: {
    slug: "image-alt-text",
    description:
      "Products with images that have no alt text. Alt text helps screen readers and image search.",
  },
  P4: {
    slug: "missing-seo-title",
    description:
      "Products with no SEO title set. Shopify falls back to the product title, but a custom title can read and rank better.",
  },
  P5: {
    slug: "missing-seo-description",
    description:
      "Products with no SEO description set. Search engines often show this text under the page title.",
  },
  P6: {
    slug: "missing-type-vendor",
    description:
      "Products with no product type or vendor. These fields drive collections, filters and reports.",
  },
  P7: {
    slug: "variant-sku",
    description:
      "Products with variants that have no SKU. SKUs help with inventory, orders and fulfilment.",
  },
  P8: {
    slug: "variant-weight",
    description:
      "Products that ship but have variants with no weight. Weight-based shipping rates can be wrong without it.",
  },
  P9: {
    slug: "no-collection",
    description: "Products that are not in any collection. They are harder for shoppers to find.",
  },
  P10: {
    slug: "duplicate-title",
    description:
      "Products that share a title with another active product. This confuses shoppers and search engines.",
  },
    I1: {
    slug: "zero-stock",
    description:
      "Active products with no stock. Shoppers see them as sold out, and they may still rank and get traffic.",
  },
  I2: {
    slug: "oversell-risk",
    description:
      "Products set to keep selling at zero stock. Orders can come in that you cannot fulfil.",
  },
  I3: {
    slug: "tracking-off",
    description:
      "Active products that do not track inventory. Shopify cannot show stock levels or warn you when they run low.",
  },
  I4: {
    slug: "inactive-with-stock",
    description:
      "Draft or archived products that still hold stock. Stock that cannot be sold is easy to forget.",
  },
};

const DETAIL: Record<string, (p: AuditProduct, ctx: Context) => string> = {
  P1: (p) => {
    const length = p.description.trim().length;
    return length === 0
      ? "Description is empty (minimum 50 characters)"
      : `${length} characters (minimum 50)`;
  },
  P2: () => "No product images",
  P3: (p) => {
    const missing = p.images.filter((image) => isBlank(image.alt)).length;
    return `${missing} of ${p.images.length} images need alt text`;
  },
  P4: () => "SEO title is empty",
  P5: () => "SEO description is empty",
  P6: (p) => {
    const missing = [
      isBlank(p.productType) && "product type",
      isBlank(p.vendor) && "vendor",
    ]
      .filter(Boolean)
      .join(" and ");
    return `Missing ${missing}`;
  },
  P7: (p) => {
    const missing = p.variants.filter((variant) => isBlank(variant.sku)).length;
    return `${missing} of ${p.variants.length} variants are missing a SKU`;
  },
  P8: (p) => {
    const missing = p.variants.filter(
      (variant) => variant.requiresShipping && variant.weight <= 0,
    ).length;
    return `${missing} shippable ${missing === 1 ? "variant has" : "variants have"} no weight`;
  },
  P9: () => "Not assigned to any collection",
  P10: (p, ctx) => {
    const count = ctx.duplicateTitleCounts.get(p.id) ?? 2;
    return `Title is shared by ${count} products`;
  },
};

// Older scans may have null details because these checks did not previously
// store detail text. Keep the issue table informative until the next scan.
export const DETAIL_FALLBACK: Record<string, string> = {
  P1: "Description is empty or under 50 characters",
  P2: "No product images",
  P3: "One or more images need alt text",
  P4: "SEO title is empty",
  P5: "SEO description is empty",
  P6: "Product type and/or vendor is missing",
  P7: "One or more variants are missing a SKU",
  P8: "One or more shippable variants have no weight",
  P9: "Not assigned to any collection",
  P10: "Title is shared by at least one other product",
};

const isBlank = (value: string | null | undefined) =>
  !value || value.trim() === "";

export const CHECKS: Check[] = [
  {
    id: "P1",
    label: "Missing or short description",
    category: "Content",
    severity: "MEDIUM",
    fails: (p) => p.description.trim().length < 50,
  },
  {
    id: "P2",
    label: "No images",
    category: "Images",
    severity: "HIGH",
    fails: (p) => p.images.length === 0,
  },
  {
    id: "P3",
    label: "Image without alt text",
    category: "Images",
    severity: "LOW",
    fails: (p) => p.images.some((i) => isBlank(i.alt)),
  },
  {
    id: "P4",
    label: "Missing SEO title",
    category: "Content",
    severity: "MEDIUM",
    fails: (p) => isBlank(p.seo.title),
  },
  {
    id: "P5",
    label: "Missing SEO description",
    category: "Content",
    severity: "MEDIUM",
    fails: (p) => isBlank(p.seo.description),
  },
  {
    id: "P6",
    label: "Missing product type or vendor",
    category: "Content",
    severity: "LOW",
    fails: (p) => isBlank(p.productType) || isBlank(p.vendor),
  },
  {
    id: "P7",
    label: "Variant without SKU",
    category: "Catalog",
    severity: "LOW",
    fails: (p) => p.variants.some((v) => isBlank(v.sku)),
  },
  {
    id: "P8",
    label: "Variant without weight",
    category: "Catalog",
    severity: "MEDIUM",
    fails: (p) => p.variants.some((v) => v.requiresShipping && v.weight <= 0),
  },
  {
    id: "P9",
    label: "Not in any collection",
    category: "Catalog",
    severity: "LOW",
    fails: (p) => p.collectionCount === 0,
  },
  {
    id: "P10",
    label: "Duplicate title",
    category: "Catalog",
    severity: "MEDIUM",
    fails: (p, ctx) => ctx.duplicateIds.has(p.id),
  },
    {
    id: "I1",
    label: "Active product out of stock",
    category: "Inventory",
    severity: "MEDIUM",
    fails: (p) => p.tracksInventory && p.totalInventory <= 0,
  },
  {
    id: "I2",
    label: "Oversell risk",
    category: "Inventory",
    severity: "HIGH",
    fails: (p) =>
      p.tracksInventory &&
      p.variants.some(
        (v) => v.inventoryPolicy === "CONTINUE" && v.inventoryQuantity <= 0,
      ),
  },
  {
    id: "I3",
    label: "Inventory tracking off",
    category: "Inventory",
    severity: "LOW",
    fails: (p) => !p.tracksInventory,
  },
  {
    id: "I4",
    label: "Inactive product with stock",
    category: "Inventory",
    severity: "LOW",
    scope: "inactive",
    fails: (p) => p.totalInventory > 0,
  },
];

export type FoundIssue = {
  productId: string;
  title: string;
  checkId: string;
  severity: Severity;
  detail: string | null;
};

export function runChecks(allProducts: AuditProduct[]) {
  // Gift cards are skipped.
  const products = allProducts.filter((p) => !p.isGiftCard);
  const active = products.filter((p) => p.status === "ACTIVE");
  const inactive = products.filter((p) => p.status !== "ACTIVE");

  // Duplicate titles are only compared among active products.
  const byTitle = new Map<string, string[]>();
  for (const p of active) {
    const key = p.title.trim().toLowerCase();
    const ids = byTitle.get(key) ?? [];
    ids.push(p.id);
    byTitle.set(key, ids);
  }
  const duplicateIds = new Set<string>();
  const duplicateTitleCounts = new Map<string, number>();
  for (const ids of byTitle.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => {
        duplicateIds.add(id);
        duplicateTitleCounts.set(id, ids.length);
      });
    }
  }

  const ctx: Context = { duplicateIds, duplicateTitleCounts };
  const issues: FoundIssue[] = [];

  const run = (list: AuditProduct[], inactiveOnly: boolean) => {
    for (const product of list) {
      for (const check of CHECKS) {
        if ((check.scope === "inactive") !== inactiveOnly) continue;
        if (!check.fails(product, ctx)) continue;
        issues.push({
          productId: product.id,
          title: product.title,
          checkId: check.id,
          severity: check.severity,
          detail: DETAIL[check.id]?.(product, ctx) ?? null,
        });
      }
    }
  };

  run(active, false);
  run(inactive, true);

  return { checked: active.length, issues };
}

const WEIGHT: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export function computeScores(checked: number, issues: { checkId: string }[]) {
  if (checked === 0) return null;

  const failing = new Map<string, number>();
  for (const issue of issues) {
    failing.set(issue.checkId, (failing.get(issue.checkId) ?? 0) + 1);
  }

  const categories = new Map<Category, { weight: number; lost: number }>();
  for (const check of CHECKS) {
    const entry = categories.get(check.category) ?? { weight: 0, lost: 0 };
    const weight = WEIGHT[check.severity];
    entry.weight += weight;
    entry.lost += weight * Math.min(1, (failing.get(check.id) ?? 0) / checked);
    categories.set(check.category, entry);
  }

  const byCategory: Record<string, number> = {};
  for (const [category, { weight, lost }] of categories) {
    byCategory[category] = Math.round(100 * (1 - lost / weight));
  }

  const values = Object.values(byCategory);
  const overall = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return { overall, byCategory };
}