import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendLowStockEmail(args: {
    to: string | string[];
  kind?: "low" | "out";
  shop: string;
  title: string;
  stock: number;
  productId: string;
}): Promise<boolean> {
const out = args.kind === "out";
const handle = args.shop.replace(".myshopify.com", "");
const numericId = args.productId.split("/").pop();
const link = `https://admin.shopify.com/store/${handle}/products/${numericId}`;
  if (!resend) {
    console.warn("RESEND_API_KEY is missing, email skipped");
    return false;
  }

  try {
  
const { error } = await resend.emails.send({
  from:
    process.env.ALERT_FROM_EMAIL ??
    "StockPing <onboarding@resend.dev>",
  to: args.to,
  subject: out
  ? `Out of Stock Alert: ${args.title}`
  : `Low Stock Alert: ${args.title} — ${args.stock} Units Remaining`,
  text: `
Hi Merchant,

This is an automated notification from StockPing to let you know that one of your products ${out ? "is now out of stock" : "has fallen below its configured stock threshold"}.

PRODUCT STOCK STATUS
-------------------
Product: ${args.title}
Store: ${args.shop}
Current Stock: ${args.stock} units
Open product: ${link}


RECOMMENDED ACTION
------------------
Please review your inventory and consider restocking this product to avoid potential stockouts and missed sales.

You can review the product's inventory in your store's admin dashboard.

Regards,
StockPing Team

This is an automated inventory notification. You're receiving it because a product in your store has reached its low-stock alert condition.
  `.trim(),
});

     if (error) {
      console.error("Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email failed:", err);
    return false;
  }

}

