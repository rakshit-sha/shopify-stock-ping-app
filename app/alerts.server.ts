import prisma from "./db.server";

// Recipients saved in Settings. Falls back to the older single alertEmail
// until the merchant saves Settings once.
export async function getRecipients(shop: string, legacyEmail?: string | null) {
  const rows = await prisma.alertRecipient.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length > 0) return rows.map((r) => r.email);
  return legacyEmail ? [legacyEmail] : [];
}