import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { refreshScan, startScan } from "../audit/scan.server";
import { CHECKS, CHECK_INFO, SEVERITY_LABEL } from "../audit/checks";
import type { Severity } from "../audit/checks";

export const SEVERITY_COLOR: Record<Severity, string> = {
  HIGH: "#e5484d",
  MEDIUM: "#f5a623",
  LOW: "#30a46c",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let latest = await prisma.scan.findFirst({
    where: { shop },
    orderBy: { startedAt: "desc" },
  });

  // Backup for a late or missed webhook: ask Shopify directly.
  if (latest?.status === "RUNNING") {
    latest = (await refreshScan(admin, latest.id)) ?? latest;
  }

  const history = await prisma.scan.findMany({
    where: { shop },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  const bySeverity = history.length
    ? await prisma.issue.groupBy({
        by: ["scanId", "severity"],
        where: { scanId: { in: history.map((s) => s.id) } },
        _count: { _all: true },
      })
    : [];
  const countOf = (scanId: string, severity: Severity) =>
    bySeverity.find((g) => g.scanId === scanId && g.severity === severity)
      ?._count._all ?? 0;

  const rows = history.map((scan, i) => {
    const previous = history.slice(i + 1).find((s) => s.status === "DONE");
    return {
      id: scan.id,
      startedAt: scan.startedAt.toISOString(),
      status: scan.status,
      score: scan.score,
      change:
        scan.status === "DONE" && scan.score !== null && previous?.score != null
          ? scan.score - previous.score
          : null,
      critical: countOf(scan.id, "HIGH"),
      shouldFix: countOf(scan.id, "MEDIUM"),
      nice: countOf(scan.id, "LOW"),
    };
  });

  const lastDone = await prisma.scan.findFirst({
    where: { shop, status: "DONE" },
    orderBy: { startedAt: "desc" },
  });

  const perCheck = lastDone
    ? await prisma.issue.groupBy({
        by: ["checkId"],
        where: { scanId: lastDone.id },
        _count: { _all: true },
      })
    : [];

  const checks = CHECKS.map((check) => ({
    slug: CHECK_INFO[check.id].slug,
    label: check.label,
    severity: check.severity,
    count: perCheck.find((c) => c.checkId === check.id)?._count._all ?? 0,
  }));

  const totals = { critical: 0, shouldFix: 0, nice: 0 };
  for (const check of checks) {
    if (check.severity === "HIGH") totals.critical += check.count;
    else if (check.severity === "MEDIUM") totals.shouldFix += check.count;
    else totals.nice += check.count;
  }

  return {
    latest: latest ? { status: latest.status, error: latest.error } : null,
    lastDone: lastDone
      ? {
          score: lastDone.score,
          startedAt: lastDone.startedAt.toISOString(),
          productsChecked: lastDone.productsChecked,
          change: rows.find((r) => r.id === lastDone.id)?.change ?? null,
        }
      : null,
    totals,
    checks,
    rows,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await startScan(admin, session.shop);
  return null;
};

const card: React.CSSProperties = {
  padding: 16,
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: 12,
};

const riskLabel = (score: number) =>
  score >= 80 ? "Low risk" : score >= 50 ? "Medium risk" : "High risk";

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = score >= 80 ? "#30a46c" : score >= 50 ? "#f5a623" : "#e5484d";

  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      role="img"
      aria-label={`Score ${score} out of 100`}
    >
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#e1e3e5" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="70" textAnchor="middle" fontSize="30" fontWeight="600">
        {score}
      </text>
      <text x="70" y="92" textAnchor="middle" fontSize="12" fill="#6d7175">
        / 100
      </text>
    </svg>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        marginRight: 6,
      }}
    />
  );
}

export default function Audit() {
  const { latest, lastDone, totals, checks, rows } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const inProgress =
    latest?.status === "RUNNING" || latest?.status === "PROCESSING";
  const busy = inProgress || navigation.state === "submitting";

  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => revalidator.revalidate(), 3000);
    return () => clearInterval(timer);
  }, [inProgress, revalidator]);

  return (
    <s-page heading="Store health">
      <div
        style={{
          padding: 16,
          display: "grid",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Store health</h2>
              <p style={{ margin: "4px 0 0", color: "#6d7175" }}>
                {inProgress ? (
                  "Scan in progress..."
                ) : latest?.status === "FAILED" ? (
                  `Last scan failed: ${latest.error ?? "unknown error"}`
                ) : lastDone ? (
                  <span suppressHydrationWarning>
                    Last scan: {new Date(lastDone.startedAt).toLocaleString()} ·{" "}
                    {lastDone.productsChecked} products checked
                  </span>
                ) : (
                  "No scans yet."
                )}
              </p>
            </div>
            <Form method="post">
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderRadius: 8,
                  background: "#303030",
                  color: "#fff",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "Scanning..." : "Run new scan"}
              </button>
            </Form>
          </div>

          {lastDone && (
            <div
              style={{
                display: "flex",
                gap: 32,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 16,
              }}
            >
              <ScoreRing score={lastDone.score ?? 0} />
              <div>
                <p style={{ margin: "0 0 12px" }}>
                  <strong>{riskLabel(lastDone.score ?? 0)}</strong>
                  {lastDone.change !== null && (
                    <span
                      style={{
                        marginLeft: 8,
                        color: lastDone.change >= 0 ? "#0c7a43" : "#c4290d",
                      }}
                    >
                      {lastDone.change >= 0 ? "+" : ""}
                      {lastDone.change} since last scan
                    </span>
                  )}
                </p>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {(
                    [
                      ["HIGH", totals.critical],
                      ["MEDIUM", totals.shouldFix],
                      ["LOW", totals.nice],
                    ] as [Severity, number][]
                  ).map(([severity, value]) => (
                    <div key={severity}>
                      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
                      <div style={{ color: "#6d7175" }}>
                        <Dot color={SEVERITY_COLOR[severity]} />
                        {SEVERITY_LABEL[severity]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {lastDone && (
          <div style={card}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Audit categories</h2>
            <p style={{ margin: "0 0 12px", color: "#6d7175" }}>
              Select a category to see the affected products.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                gap: 12,
              }}
            >
              {checks.map((check) => (
                <Link
                  key={check.slug}
                  to={`/app/audit/${check.slug}`}
                  style={{
                    display: "block",
                    padding: 12,
                    border: "1px solid #e1e3e5",
                    borderRadius: 10,
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ minHeight: 36 }}>{check.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, margin: "4px 0" }}>
                    {check.count}
                  </div>
                  <div
                    style={{
                      color: check.count === 0 ? "#0c7a43" : "#6d7175",
                      fontSize: 13,
                    }}
                  >
                    {check.count === 0 ? (
                      "No issues"
                    ) : (
                      <>
                        <Dot color={SEVERITY_COLOR[check.severity]} />
                        {SEVERITY_LABEL[check.severity]}
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div style={card}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Scan history</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="app-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Date and time</th>
                    <th>Score</th>
                    <th>Change</th>
                    <th>Critical</th>
                    <th>Should fix</th>
                    <th>Nice to have</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span suppressHydrationWarning>
                          {new Date(row.startedAt).toLocaleString()}
                        </span>
                      </td>
                      <td>{row.score ?? "—"}</td>
                      <td
                        style={{
                          color:
                            row.change === null
                              ? "inherit"
                              : row.change >= 0
                                ? "#0c7a43"
                                : "#c4290d",
                        }}
                      >
                        {row.change === null
                          ? "—"
                          : `${row.change >= 0 ? "+" : ""}${row.change}`}
                      </td>
                      <td>{row.critical}</td>
                      <td>{row.shouldFix}</td>
                      <td>{row.nice}</td>
                      <td>
                        {row.status === "DONE"
                          ? "Completed"
                          : row.status === "FAILED"
                            ? "Failed"
                            : "In progress"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
