import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Sent 48 hours after uninstall: erase everything stored for this shop.
// If you add a table that holds a shop's data, add it to this list.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await prisma.$transaction([
    prisma.issue.deleteMany({ where: { shop } }),
    prisma.scan.deleteMany({ where: { shop } }),
    prisma.stockAlert.deleteMany({ where: { shop } }),
    prisma.alertLog.deleteMany({ where: { shop } }),
    prisma.alertRecipient.deleteMany({ where: { shop } }),
    prisma.stockSettings.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};