import prisma from "../db.server";
import type { authenticate } from "../shopify.server";
import { computeScores, runChecks } from "./checks";

type Admin = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

const STALE_MINUTES = 30;

const AUDIT_QUERY = `
{
  products {
    edges {
      node {
        id
        title
        description
        vendor
        productType
        isGiftCard
        status
        tracksInventory
        totalInventory
        seo { title description }
        variants {
          edges {
            node {
              id
              sku
              inventoryItem {
                requiresShipping
                measurement { weight { value } }
              }
              inventoryPolicy
              inventoryQuantity
            }
          }
        }
        media {
          edges { node { id mediaContentType alt } }
        }
        collections {
          edges { node { id } }
        }
      }
    }
  }
}`;

export type AuditProduct = {
  id: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  isGiftCard: boolean;
  status: string;
  tracksInventory: boolean;
  totalInventory: number;
  seo: { title: string | null; description: string | null };
  variants: {
    id: string;
    sku: string | null;
    requiresShipping: boolean;
    weight: number;
    inventoryPolicy: string;
    inventoryQuantity: number;
  }[];
  images: { alt: string | null }[];
  collectionCount: number;
};

export async function startScan(
  admin: Admin,
  shop: string
) {
  const since = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  const running = await prisma.scan.findFirst({
    where: {
      shop,
      status: { in: ["RUNNING", "PROCESSING"] },
      startedAt: { gt: since },
    },
  });
  if (running) return running;

  const scan = await prisma.scan.create({
    data: { shop, status: "RUNNING" },
  });

  const fail = (error: string) =>
    prisma.scan.update({
      where: { id: scan.id },
      data: { status: "FAILED", error, finishedAt: new Date() },
    });

  try {
    const response = await admin.graphql(
      `#graphql
      mutation RunAudit($query: String!) {
        bulkOperationRunQuery(query: $query, groupObjects: false) {
          bulkOperation { id status }
          userErrors { field message }
        }
      }`,
      { variables: { query: AUDIT_QUERY } },
    );
    const json = await response.json();
    const result = json.data?.bulkOperationRunQuery;
    const message = result?.userErrors?.[0]?.message;

    if (message || !result?.bulkOperation) {
      return await fail(message ?? "Could not start the scan");
    }

    return await prisma.scan.update({
      where: { id: scan.id },
      data: { bulkOperationId: result.bulkOperation.id },
    });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : "Unknown error");
  }
}

// Called by the finish webhook and by the Audit page (as a backup).
export async function refreshScan(admin: Admin, scanId: string) {
  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.status !== "RUNNING" || !scan.bulkOperationId) return scan;

  const response = await admin.graphql(
    `#graphql
    query BulkStatus($id: ID!) {
      node(id: $id) {
        ... on BulkOperation { id status errorCode url objectCount }
      }
    }`,
    { variables: { id: scan.bulkOperationId } },
  );
  const json = await response.json();
  const op = json.data?.node;
  if (!op || op.status === "CREATED" || op.status === "RUNNING") return scan;

  // Only one caller (webhook or page) gets to process the result.
  const claimed = await prisma.scan.updateMany({
    where: { id: scan.id, status: "RUNNING" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return scan;

  try {
    if (op.status !== "COMPLETED") {
      throw new Error(
        `Bulk operation ${op.status}${op.errorCode ? ` (${op.errorCode})` : ""}`,
      );
    }

    const products = op.url ? await downloadProducts(op.url) : [];
    const { checked, issues } = runChecks(products);
    const scores = computeScores(checked, issues);

    for (let i = 0; i < issues.length; i += 500) {
      await prisma.issue.createMany({
        data: issues.slice(i, i + 500).map((issue) => ({
          ...issue,
          scanId: scan.id,
          shop: scan.shop,
        })),
      });
    }

    const done = await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "DONE",
        productsChecked: checked,
        score: scores?.overall ?? null,
        finishedAt: new Date(),
      },
    });

    return done;
  } catch (e) {
    return await prisma.scan.update({
      where: { id: scan.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : "Unknown error",
        finishedAt: new Date(),
      },
    });
  }
}

async function downloadProducts(url: string): Promise<AuditProduct[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download results (${response.status})`);
  }
  const text = await response.text();

  const products = new Map<string, AuditProduct>();

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const parentId: string | undefined = row.__parentId;

    if (!parentId) {
      products.set(row.id, {
        id: row.id,
        title: row.title ?? "",
        description: row.description ?? "",
        vendor: row.vendor ?? "",
        productType: row.productType ?? "",
        isGiftCard: Boolean(row.isGiftCard),
        status: row.status ?? "ACTIVE",
        tracksInventory: Boolean(row.tracksInventory),
        totalInventory: row.totalInventory ?? 0,
        seo: {
          title: row.seo?.title ?? null,
          description: row.seo?.description ?? null,
        },
        variants: [],
        images: [],
        collectionCount: 0,
      });
      continue;
    }

    const product = products.get(parentId);
    if (!product) continue;

    if (row.id.startsWith("gid://shopify/ProductVariant/")) {
      product.variants.push({
        id: row.id,
        sku: row.sku ?? null,
        inventoryPolicy: row.inventoryPolicy ?? "DENY",
        inventoryQuantity: row.inventoryQuantity ?? 0,
        requiresShipping: Boolean(row.inventoryItem?.requiresShipping),
        weight: row.inventoryItem?.measurement?.weight?.value ?? 0,
      });
    } else if (row.id.startsWith("gid://shopify/Collection/")) {
      product.collectionCount += 1;
    } else if (row.mediaContentType === "IMAGE") {
      product.images.push({ alt: row.alt ?? null });
    }
  }

  return [...products.values()];
}

