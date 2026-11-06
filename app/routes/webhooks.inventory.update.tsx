import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendLowStockEmail } from "../email.server";
import { getRecipients } from "../alerts.server";

const DEFAULT_THRESHOLD = 10;

const PRODUCT_QUERY = `#graphql
  query ProductByInventoryItem($id: ID!) {
    inventoryItem(id: $id) {
      variants(first: 1) {
        nodes {
          product {
            id
            title
            status
            isGiftCard
            tracksInventory
            variants(first: 25) {
              nodes {
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    nodes {
                      location { id }
                      quantities(names: ["available"]) { quantity }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, admin, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) return new Response();

  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: {
      id: `gid://shopify/InventoryItem/${payload.inventory_item_id}`,
    },
  });

  const json = await response.json();

  const product = json.data?.inventoryItem?.variants?.nodes?.[0]?.product;
  if (
    !product ||
    product.isGiftCard ||
    !product.tracksInventory ||
    product.status !== "ACTIVE"
  ) {
    return new Response();
  }

  // Shopify's product total can lag behind the webhook, so build the total
  // from the webhook's own quantity plus the other locations.
  const changedItem = `gid://shopify/InventoryItem/${payload.inventory_item_id}`;
  const changedLocation = `gid://shopify/Location/${payload.location_id}`;

  let total = 0;
  for (const variant of product.variants.nodes) {
    for (const level of variant.inventoryItem.inventoryLevels.nodes) {
      const isChanged =
        variant.inventoryItem.id === changedItem &&
        level.location.id === changedLocation;
      total += isChanged
        ? (payload.available ?? 0)
        : (level.quantities[0]?.quantity ?? 0);
    }
  }

  const settings = await prisma.stockSettings.findUnique({ where: { shop } });
  const threshold = settings?.threshold ?? DEFAULT_THRESHOLD;
  
  const recipients = await getRecipients(shop, settings?.alertEmail);
  const lowOn = settings?.lowStockAlerts ?? true;
  const outOn = settings?.outOfStockAlerts ?? true;

  if (total <= threshold) {
    const isOut = total <= 0;
    let kind: "low" | "out" | null = null;

    try {
      await prisma.stockAlert.create({
        data: {
          shop,
          productId: product.id,
          title: product.title,
          stock: total,
          outOfStockNotified: isOut && outOn,
        },
      });
      // New alert. At zero stock, the out-of-stock type wins.
      if (isOut && outOn) kind = "out";
      else if (lowOn) kind = "low";
    } catch (e) {
      // P2002 = unique constraint: this product already has an alert row
      if ((e as { code?: string }).code !== "P2002") throw e;

      await prisma.stockAlert.update({
        where: { shop_productId: { shop, productId: product.id } },
        data: { stock: total, title: product.title },
      });

      if (isOut && outOn) {
        // Send once when an already-alerted product reaches zero.
        const claimed = await prisma.stockAlert.updateMany({
          where: { shop, productId: product.id, outOfStockNotified: false },
          data: { outOfStockNotified: true },
        });
        if (claimed.count === 1) kind = "out";
      } else if (!isOut) {
        // Back above zero but still low: allow another out-of-stock alert later.
        await prisma.stockAlert.updateMany({
          where: { shop, productId: product.id, outOfStockNotified: true },
          data: { outOfStockNotified: false },
        });
      }
    }

    console.log(`Low stock: ${product.title} (${total})`);

    if (kind && recipients.length > 0) {
      const sent = await sendLowStockEmail({
        to: recipients,
        shop,
        title: product.title,
        stock: total,
        productId: product.id,
        kind,
      });
      if (sent) {
        await prisma.alertLog.create({
          data: {
            shop,
            productId: product.id,
            title: product.title,
            stock: total,
            sentTo: recipients.join(", "),
            kind,
          },
        });
      }
    }
  } else {
    await prisma.stockAlert.deleteMany({
      where: { shop, productId: product.id },
    });
  }

  return new Response();
};
