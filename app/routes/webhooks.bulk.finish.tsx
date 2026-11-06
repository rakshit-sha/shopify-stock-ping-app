import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { refreshScan } from "../audit/scan.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, admin, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!admin) return new Response();

  const scan = await prisma.scan.findFirst({
    where: { shop, bulkOperationId: payload.admin_graphql_api_id },
  });
  if (scan) await refreshScan(admin, scan.id);

  return new Response();
};