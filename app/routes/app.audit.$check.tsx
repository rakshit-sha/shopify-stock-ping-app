import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useEffect, useState } from "react";
import { CHECKS, CHECK_INFO, DETAIL_FALLBACK, SEVERITY_LABEL } from "../audit/checks";
import { SEVERITY_COLOR } from "./app.audit._index";

const PAGE_SIZE = 20;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const check = CHECKS.find((c) => CHECK_INFO[c.id].slug === params.check);
  if (!check) throw new Response("Check not found", { status: 404 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const lastDone = await prisma.scan.findFirst({
    where: { shop: session.shop, status: "DONE" },
    orderBy: { startedAt: "desc" },
  });

  const base = {
    check: {
      label: check.label,
      description: CHECK_INFO[check.id].description,
      severity: check.severity,
    },
    q,
    page,
  };

  if (!lastDone) {
    return { ...base, hasScan: false, affected: 0, total: 0, pages: 1, issues: [] };
  }

  const scope = { scanId: lastDone.id, checkId: check.id };
  const where = q ? { ...scope, title: { contains: q } } : scope;

  const [affected, total, issues] = await Promise.all([
    prisma.issue.count({ where: scope }),
    prisma.issue.count({ where }),
    prisma.issue.findMany({
      where,
      orderBy: { title: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  type ProductRowInfo = {
    id: string;
    status: string;
    updatedAt: string;
    featuredImage: { url: string; altText: string | null } | null;
    collections: { nodes: { title: string }[] };
  } | null;

  const productInfo = new Map<string, NonNullable<ProductRowInfo>>();
  if (issues.length > 0) {
    const response = await admin.graphql(
      `#graphql
      query AuditIssueProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            status
            updatedAt
            featuredImage { url altText }
            collections(first: 10) { nodes { title } }
          }
        }
      }`,
      { variables: { ids: issues.map((issue) => issue.productId) } },
    );
    const result = (await response.json()) as {
      data?: { nodes: ProductRowInfo[] };
    };

    for (const product of result.data?.nodes ?? []) {
      if (product) productInfo.set(product.id, product);
    }
  }

  return {
    ...base,
    hasScan: true,
    affected,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    issues: issues.map((i) => ({
      id: i.id,
      numericId: i.productId.split("/").pop(),
      title: i.title,
      detail: i.detail ?? DETAIL_FALLBACK[i.checkId] ?? null,
      status: productInfo.get(i.productId)?.status ?? "UNAVAILABLE",
      imageUrl: productInfo.get(i.productId)?.featuredImage?.url ?? null,
      imageAlt: productInfo.get(i.productId)?.featuredImage?.altText ?? "",
      collections: productInfo.get(i.productId)?.collections.nodes.map((collection) => collection.title) ?? [],
      updatedAt: productInfo.get(i.productId)?.updatedAt ?? null,
    })),
  };
};

export default function CheckPage() {
  const { check, hasScan, affected, total, page, pages, q, issues } = useLoaderData<typeof loader>();
  const pageLink = (n: number) => `?page=${n}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const navigate = useNavigate();
  const [search, setSearch] = useState(q);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    const query = search.trim();
    if (!query || query === q) return;

    const timeout = window.setTimeout(() => {
      navigate(`?q=${encodeURIComponent(query)}`, { replace: true });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [navigate, q, search]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setSearch(value);
    if (!value) navigate("?", { replace: true });
  };

  return (
    <s-page heading={check.label} inline-size="large">
      <div
        style={{
          padding: 16,
          display: "grid",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <s-button variant="primary" icon="arrow-left" onClick={() => navigate("/app/audit")}>
        Store health
        </s-button>
        <div
          style={{
            padding: 16,
            background: "#fff",
            border: "1px solid #e1e3e5",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ maxWidth: 640 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{check.label}</h2>
              <p style={{ margin: 0, color: "#6d7175" }}>{check.description}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 600, color: SEVERITY_COLOR[check.severity] }}>{affected}</div>
              <div style={{ color:SEVERITY_COLOR[check.severity] }} >
                {SEVERITY_LABEL[check.severity]} <span style={{ color: "#6d7175" }}>· products affected</span>
              </div>
            </div>
          </div>

          {!hasScan ? (
            <p style={{ margin: "16px 0 0" }}>
              No scan yet. Run one from <Link to="/app/audit">Store health</Link>.
            </p>
          ) : affected === 0 ? (
            <p style={{ margin: "16px 0 0", color: "#0c7a43" }}>
              No products have this issue.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
                <input
                  type="search"
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Search products"
                  aria-label="Search products"
                  style={{
                    padding: "8px 10px",
                    border: "1px solid #8a8a8a",
                    borderRadius: 8,
                    width: 260,
                  }}
                />
           
              </div>

              {total === 0 ? (
                <p>No products match your search.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="app-table" style={{ minWidth: 1100 }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Status</th>
                        <th>Collection</th>
                        <th>Last updated</th>
                        <th>Details</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map((issue) => (
                        <tr key={issue.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              {issue.imageUrl ? (
                                <img
                                  src={issue.imageUrl}
                                  alt={issue.imageAlt || ""}
                                  width={40}
                                  height={40}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    objectFit: "cover",
                                    borderRadius: 6,
                                    border: "1px solid #e1e3e5",
                                  }}
                                />
                              ) : (
                                <div
                                  aria-label="No product image"
                                  style={{
                                    width: 40,
                                    height: 40,
                                    flex: "0 0 40px",
                                    borderRadius: 6,
                                    border: "1px solid #e1e3e5",
                                    background: "#f6f6f7",
                                  }}
                                />
                              )}
                              <div style={{ display: "grid", gap: 3 }}>
                                <a
                                  href={`shopify:admin/products/${issue.numericId}`}
                                  target="_top"
                                  style={{ color: "#202223", fontWeight: 600, textDecoration: "none" }}
                                >
                                  {issue.title} <span aria-label="Open product in Shopify">↗</span>
                                </a>
                                <span style={{ color: "#6d7175", fontSize: 12 }}>
                                  Product ID: {issue.numericId}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: 999,
                                background:
                                  issue.status === "ACTIVE"
                                    ? "#d8f7e5"
                                    : issue.status === "DRAFT"
                                      ? "#fff1cc"
                                      : "#f1f2f3",
                                color:
                                  issue.status === "ACTIVE"
                                    ? "#087a3e"
                                    : issue.status === "DRAFT"
                                      ? "#8a5b00"
                                      : "#5c5f62",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {issue.status === "UNAVAILABLE"
                                ? "Unavailable"
                                : issue.status.charAt(0) + issue.status.slice(1).toLowerCase()}
                            </span>
                          </td>
                          <td>
                            {issue.collections.length > 0
                              ? issue.collections.join(", ")
                              : "—"}
                          </td>
                          <td>
                            {issue.updatedAt
                              ? new Date(issue.updatedAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "2-digit",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td>{issue.detail ?? "—"}</td>
                          <td>
                            <s-button variant="secondary" tone="critical" icon="external"    href={`shopify:admin/products/${issue.numericId}`} target="_top">
                                Go To Product
                            </s-button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {total > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                  }}
                >
                  <span style={{ color: "#6d7175" }}>
                    Showing {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, total)} of {total}
                  </span>
                  <span style={{ display: "flex", gap: 12 }}>
                    {page > 1 ? (
                      <Link to={pageLink(page - 1)}>Previous</Link>
                    ) : (
                      <span style={{ color: "#8a8a8a" }}>Previous</span>
                    )}
                    {page < pages ? (
                      <Link to={pageLink(page + 1)}>Next</Link>
                    ) : (
                      <span style={{ color: "#8a8a8a" }}>Next</span>
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
