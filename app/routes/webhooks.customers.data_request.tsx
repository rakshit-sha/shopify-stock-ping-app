import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// StockPing stores no customer data, so there is nothing to return.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};