import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useEffect, useRef, useState } from "react";
import { Bell, Package, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Dropdown } from "../components/Dropdown";
import { getRecipients } from "../alerts.server";
import { Kpi } from "../common/Kpi";

const DEFAULT_THRESHOLD = 10;
const PAGE_SIZE = 10;
const FETCH_SIZE = 50;
const MAX_FETCHES = 5;

const LOW_STOCK_QUERY = `#graphql
  query LowStockProducts($after: String) {
    products(first: ${FETCH_SIZE}, sortKey: INVENTORY_TOTAL, query: "status:active", after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        isGiftCard
        tracksInventory
        totalInventory
        variantsCount { count }
        variants(first: 1) { nodes { sku } }
        featuredMedia { preview { image { url(transform: { maxWidth: 96 }) } } }
      }
    }
  }`;

type ProductNode = {
  id: string;
  title: string;
  isGiftCard: boolean;
  tracksInventory: boolean;
  totalInventory: number;
  variantsCount: { count: number } | null;
  variants: { nodes: { sku: string | null }[] };
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const settings = await prisma.stockSettings.findUnique({
    where: { shop: session.shop },
  });
  const threshold = settings?.threshold ?? DEFAULT_THRESHOLD;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "all";
  const requestedPage = Math.max(1, Number(url.searchParams.get("page")) || 1);

  // Products come sorted by stock, lowest first, so stop at the first one
  // above the threshold.
  const low: ProductNode[] = [];
  let after: string | null = null;
  let done = false;

  for (let i = 0; i < MAX_FETCHES; i++) {
    const response = await admin.graphql(LOW_STOCK_QUERY, {
      variables: { after },
    });
    const json = await response.json();
    const data = json.data?.products;
    if (!data) {
      done = true;
      break;
    }

    let reachedHigher = false;
    for (const p of data.nodes as ProductNode[]) {
      if (p.totalInventory > threshold) {
        reachedHigher = true;
        break;
      }
      if (!p.isGiftCard && p.tracksInventory) low.push(p);
    }

    if (reachedHigher || !data.pageInfo.hasNextPage) {
      done = true;
      break;
    }
    after = data.pageInfo.endCursor;
  }

  const all = low.map((p) => ({
    id: p.id,
    numericId: p.id.split("/").pop(),
    title: p.title,
    sku: p.variants.nodes[0]?.sku || null,
    variantCount: p.variantsCount?.count ?? 1,
    stock: p.totalInventory,
    image: p.featuredMedia?.preview?.image?.url ?? null,
  }));

  const needle = q.toLowerCase();
  const filtered = all.filter(
    (r) =>
      (status === "out" ? r.stock <= 0 : status === "low" ? r.stock > 0 : true) &&
      (!needle ||
        r.title.toLowerCase().includes(needle) ||
        (r.sku ?? "").toLowerCase().includes(needle)),
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);

  const recent = await prisma.stockAlert.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const DAY = 24 * 60 * 60 * 1000;
  const [alertsLast30, alertsPrev30] = await Promise.all([
    prisma.alertLog.count({
      where: {
        shop: session.shop,
        status: "SENT",
        createdAt: { gte: new Date(Date.now() - 30 * DAY) },
      },
    }),
    prisma.alertLog.count({
      where: {
        shop: session.shop,
        status: "SENT",
        createdAt: {
          gte: new Date(Date.now() - 60 * DAY),
          lt: new Date(Date.now() - 30 * DAY),
        },
      },
    }),
  ]);

  return {
    threshold,
    recipients: await getRecipients(session.shop, settings?.alertEmail),
    total: all.length,
    outCount: all.filter((r) => r.stock <= 0).length,
    capped: !done,
    filteredCount: filtered.length,
    page,
    pages,
    rows: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    q,
    status,
    alertsLast30, 
    alertsPrev30,
    recent: recent.map((a) => ({
      id: a.id,
      title: a.title,
      stock: a.stock,
      createdAt: a.createdAt.toISOString(),
    })),
    loadedAt: new Date().toISOString(),
  };
};

const card: React.CSSProperties = {
  padding: 16,
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: 12,
};

const cell: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid #e1e3e5",
  verticalAlign: "middle",
};

const pill = (out: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  background: out ? "#fed3d1" : "#ffea8a",
  color: out ? "#8e1f0b" : "#5e4200",
  whiteSpace: "nowrap",
});

export default function LowStock() {
  const {
    threshold,
    recipients,
    total,
    outCount,
    capped,
    filteredCount,
    page,
    pages,
    rows,
    q,
    status,
    recent,
    loadedAt,
    alertsLast30,
    alertsPrev30,
  } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
   const navigate = useNavigate();
  const [search, setSearch] = useState(q);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const applied = useRef({ q, status });

  useEffect(() => {
    if (q === applied.current.q && status === applied.current.status) return;
    applied.current = { q, status };
    setSearch(q);
    setSelectedStatus(status);
  }, [q, status]);

  useEffect(() => {
    const query = search.trim();
    if (query === applied.current.q && selectedStatus === applied.current.status) {
      return;
    }

    const timeout = window.setTimeout(() => {
      applied.current = { q: query, status: selectedStatus };
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      navigate(`?${params.toString()}`, { replace: true });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [navigate, search, selectedStatus]);

  const diff = alertsLast30 - alertsPrev30;
  const trend = alertsPrev30 > 0
    ? {
        text:
          diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : "No change",
        color: diff > 0 ? "#0c5132" : "#6d7175",
        background: diff > 0 ? "#d6f0df" : "#f1f1f1",
      }
    : undefined;

  const pageLink = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    params.set("page", String(n));
    return `?${params.toString()}`;
  };

  return (
    <s-page heading="Low Stock Alerts" inline-size="large">
      <div
        style={{
          padding: 16,
          display: "grid",
          width:"100%",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <h1>Stock Dashboard</h1>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span style={{ color: "#6d7175" }}>
            Monitor inventory and get notified before products run out of stock.
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#6d7175" }} suppressHydrationWarning>
              Updated {new Date(loadedAt).toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
              style={{
                padding: "8px 14px",
                border: "none",
                borderRadius: 8,
                background: "#303030",
                color: "#fff",
                cursor: "pointer",
                opacity: revalidator.state === "loading" ? 0.6 : 1,
              }}
            >
              {revalidator.state === "loading" ? "Refreshing..." : "Refresh"}
            </button>
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <Kpi
            label={`Products below ${threshold}`}
            value={total}
            icon={<TriangleAlert size={22} color="#dd0e14" aria-hidden="true" />}
            iconBg="#fdedec"
            note={total > 0 ? "Need attention" : "All good"}
          />
          <Kpi
            label="Out of stock"
            value={outCount}
            iconBg="#fef1dc"
            icon={<Package size={22} color="#e67f1e" aria-hidden="true" />}
            note={outCount > 0 ? "Restock now" : undefined}
          />
          <Kpi
            label="Low stock threshold"
            value={threshold}
            iconBg="#eef4ff"
            icon={<SlidersHorizontal size={22} color="#1d5efa" aria-hidden="true" />}
            note={`${threshold} units or fewer`}
          />
          <Kpi
            label="Alerts sent (30 days)"
            value={alertsLast30}
            icon={<Bell size={22} color="#36af60" aria-hidden="true" />}
            iconBg="#e7faef"
            badge={trend}
          />
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ ...card, flex: "2 1 520px", minWidth: 0 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>
              Products with {threshold} or fewer in stock ({filteredCount})
            </h2>

            <div
              style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
            >
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search products or SKU"
                aria-label="Search products"
                style={{
                  padding: "8px 10px",
                  border: "1px solid #dddcdc",
                  borderRadius: 8,
                  width: 260,
                }}
              />
               <Dropdown
                value={selectedStatus}
                
                onChange={setSelectedStatus}
                ariaLabel="Stock status"
                options={[
                  { value: "all", label: "All" },
                  { value: "low", label: "Low stock" },
                  { value: "out", label: "Out of stock" },
                ]}
              />
            </div>

            {total === 0 ? (
              <p style={{ color: "#0c7a43" }}>
                No low-stock products. Everything looks good.
              </p>
            ) : filteredCount === 0 ? (
              <p>No products match your filters.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="app-table" style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={cell}>Product</th>
                      <th style={cell}>SKU</th>
                      <th style={cell}>Current stock</th>
                      <th style={cell}>Threshold</th>
                      <th style={cell}>Status</th>
                      <th style={cell}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const out = row.stock <= 0;
                      return (
                        <tr key={row.id}>
                          <td style={cell}>
                            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {row.image ? (
                                <img
                                  src={row.image}
                                  alt=""
                                  width={36}
                                  height={36}
                                  style={{ borderRadius: 6, objectFit: "cover" }}
                                />
                              ) : (
                                <span
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 6,
                                    background: "#f1f1f1",
                                    display: "inline-block",
                                  }}
                                />
                              )}
                              {row.title}
                            </span>
                          </td>
                          <td style={cell}>
                            {row.sku ?? "—"}
                            {row.variantCount > 1 && (
                              <span style={{ color: "#6d7175" }}>
                                {" "}
                                +{row.variantCount - 1} more
                              </span>
                            )}
                          </td>
                          <td style={cell}>
                            <span style={pill(out)}>{row.stock}</span>
                          </td>
                          <td style={cell}>{threshold}</td>
                          <td style={cell}>
                            <span style={pill(out)}>
                              {out ? "Out of stock" : "Low stock"}
                            </span>
                          </td>
                           <td style={cell}>
                            <s-button  variant="secondary" tone="auto" icon="external"   href={`shopify:admin/products/${row.numericId}`} target="_top">
                                Go To Product
                            </s-button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredCount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 12,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <span style={{ color: "#6d7175" }}>
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filteredCount)} of {filteredCount}{" "}
                  products
                </span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {page > 1 ? (
                    <Link to={pageLink(page - 1)}>Previous</Link>
                  ) : (
                    <span style={{ color: "#8a8a8a" }}>Previous</span>
                  )}
                  {pages <= 7 ? (
                    Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
                      n === page ? (
                        <strong key={n}>{n}</strong>
                      ) : (
                        <Link key={n} to={pageLink(n)}>
                          {n}
                        </Link>
                      ),
                    )
                  ) : (
                    <span>
                      Page {page} of {pages}
                    </span>
                  )}
                  {page < pages ? (
                    <Link to={pageLink(page + 1)}>Next</Link>
                  ) : (
                    <span style={{ color: "#8a8a8a" }}>Next</span>
                  )}
                </span>
              </div>
            )}

            {capped && (
              <p style={{ margin: "12px 0 0", color: "#6d7175" }}>
                Showing the lowest-stock products only. This list is limited to
                the first 250.
              </p>
            )}
          </div>

          
        </div>
        <div style={{ display: "flex", gap: 16, minWidth: 0 }}>
            <div style={{...card, flex:1}}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Recent alerts</h2>
              {recent.length === 0 ? (
                <p style={{ margin: 0 }}>
                  No alerts yet. They appear when a product&apos;s stock drops to
                  your threshold.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {recent.map((alert) => (
                    <div
                      key={alert.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span>
                        <div>{alert.title}</div>
                        <div style={{ color: "#6d7175" }}>
                          {alert.stock} left
                        </div>
                      </span>
                      <span
                        style={{ color: "#6d7175", whiteSpace: "nowrap" }}
                        suppressHydrationWarning
                      >
                        {new Date(alert.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{...card, maxHeight: "fit-content"}}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Alert settings</h2>
              <p style={{ margin: "0 0 4px" }}>
                Low stock threshold: <strong>{threshold} units</strong>
              </p>
              <p style={{ margin: "0 0 12px" }}>
                Alerts go to:{" "}
                <strong>{recipients.length ? recipients.join(", ") : "not set"}</strong>
              </p>
              <Link to="/app/settings">Manage notification settings →</Link>
            </div>
          </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
