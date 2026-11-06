import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useNavigate, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  ArrowRight,
  Check,
  Play,
  Sparkles,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getRecipients } from "../alerts.server";
import { Illustration } from "../common/Illustration";
import { APP_FEATURES } from "../Constants";
import styles from "../styles/app-index.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [lastDone, settings] = await Promise.all([
    prisma.scan.findFirst({
      where: { shop, status: "DONE" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.stockSettings.findUnique({ where: { shop } }),
  ]);
  const recipients = await getRecipients(shop, settings?.alertEmail);

  return {
    lastScan: lastDone
      ? { score: lastDone.score, startedAt: lastDone.startedAt.toISOString() }
      : null,
    hasRecipients: recipients.length > 0,
  };
};
const GREEN = "#2f9e44";

const BENEFITS = [
  "Smarter product audits",
  "Boost SEO and search visibility",
  "Stay in stock with timely alerts",
];

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: 12,
};


export default function Home() {
  const { lastScan, hasRecipients } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const starting = navigation.state === "submitting";
  const navigate = useNavigate();
  return (
    <s-page heading="StockPing">
      <div className={styles.dashboard}>
        {!hasRecipients && (
          <div role="status" className={styles.alertBanner}>
            <strong>No alert email set.</strong> Low stock alerts are not being sent.{" "}
            <s-button onClick={() => navigate("/app/settings")} tone="critical" variant="secondary">Add here</s-button>
          </div>
        )}

        <section className={`${styles.card} ${styles.hero}`}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              Keep your store <span style={{ color: GREEN }}>healthy</span> and{" "}
              <span style={{ color: GREEN }}>in stock</span>
            </h1>
            <p className={styles.heroDescription}>
              Audit your products, fix SEO and content issues, and get low stock
              alerts, all in one app.
            </p>
            <div className={styles.actions}>
              <Form method="post" action="/app/audit">
                <button
                  type="submit"
                  disabled={starting}
                  className={styles.primaryAction}
                  style={{ cursor: starting ? "default" : "pointer", opacity: starting ? 0.7 : 1 }}
                >
                  <Play size={16} aria-hidden="true" />
                  {lastScan ? "Run a new scan" : "Run a scan"}
                </button>
              </Form>
              <Link
                to="/app/audit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "10px 18px",
                  border: "1px solid #dddcdc",
                  borderRadius: 8,
                  background: "#fff",
                  color: "inherit",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                View store health
              </Link>
            </div>
            {lastScan && lastScan.score !== null && (
              <p className={styles.scanStatus}>
                Store health score: <strong>{lastScan.score} / 100</strong> ·
                last scan{" "}
                <span suppressHydrationWarning>
                  {new Date(lastScan.startedAt).toLocaleDateString()}
                </span>
              </p>
            )}
          </div>
          <Illustration className={styles.illustration} />
        </section>

        <section>
          <h2 style={{ margin: 0, fontSize: 20 }}>Explore features</h2>
          <p style={{ margin: "4px 0 16px", color: "#6d7175" }}>
            Everything you need to improve product quality, SEO, and inventory
            management.
          </p>
          <div
            className={styles.featureGrid}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
              gap: 16,
            }}
          >
            {APP_FEATURES.map(({ to, title, text, icon: Icon, color, bg }) => (
              <Link
                key={to}
                to={to}
                className={`${styles.card} ${styles.featureCard}`}
                style={{
                  ...card,
                  display: "flex",
                  gap: 12,
                  padding: 16,
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={22} color={color} aria-hidden="true" />
                </span>
                <span className={styles.featureContent}>
                  <span
                    className={styles.featureTitle}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: 600,
                      fontSize: 15,
                    }}
                  >
                    {title}
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                  <span className={styles.featureDescription} style={{ display: "block", marginTop: 4, color: "#6d7175" }}>
                    {text}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.benefits}`}>
          <strong className={styles.benefitsHeading} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
            <Sparkles size={18} color={GREEN} aria-hidden="true" />
            Why use StockPing?
          </strong>
          {BENEFITS.map((text) => (
            <span
              key={text}
              style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 200px" }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  border: `2px solid ${GREEN}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check size={12} color={GREEN} strokeWidth={3} />
              </span>
              {text}
            </span>
          ))}
        </section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
