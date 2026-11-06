import { useState } from "react";
import type { ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Bell,
  Boxes,
  Mail,
  TriangleAlert,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getRecipients } from "../alerts.server";
import { EmailChips } from "../components/EmailChips";
import { Toggle } from "../components/Toggle";

const DEFAULT_THRESHOLD = 10;
const MAX_RECIPIENTS = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.stockSettings.findUnique({
    where: { shop: session.shop },
  });
  const recipients = await getRecipients(session.shop, settings?.alertEmail);

  return {
    threshold: settings?.threshold ?? DEFAULT_THRESHOLD,
    recipients,
    lowStockAlerts: settings?.lowStockAlerts ?? true,
    outOfStockAlerts: settings?.outOfStockAlerts ?? true,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const threshold = Number(formData.get("threshold"));
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10000) {
    return { ok: false, error: "Enter a whole number between 0 and 10000." };
  }

  const recipients = [
    ...new Set(
      formData
        .getAll("recipient")
        .map((v) => String(v).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (recipients.some((email) => !EMAIL.test(email))) {
    return { ok: false, error: "One of the email addresses is not valid." };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `You can add up to ${MAX_RECIPIENTS} addresses.`,
    };
  }

  const data = {
    threshold,
    alertEmail: null,
    lowStockAlerts: formData.get("lowStockAlerts") === "on",
    outOfStockAlerts: formData.get("outOfStockAlerts") === "on",
  };

  await prisma.$transaction([
    prisma.stockSettings.upsert({
      where: { shop },
      update: data,
      create: { shop, ...data },
    }),
    prisma.alertRecipient.deleteMany({ where: { shop } }),
    prisma.alertRecipient.createMany({
      data: recipients.map((email) => ({ shop, email })),
    }),
  ]);
  return { ok: true, error: null };
};

type SettingsData = {
  threshold: number;
  recipients: string[];
  lowStockAlerts: boolean;
  outOfStockAlerts: boolean;
};

const card: React.CSSProperties = {
  padding: 16,
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: 12,
};

const field: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #dddcdc",
  borderRadius: 8,
};

function IconBubble({ children, bg }: { children: ReactNode; bg: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

function SettingCard({
  icon,
  iconBg,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section style={card}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <IconBubble bg={iconBg}>{icon}</IconBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <p style={{ margin: "2px 0 12px", color: "#6d7175" }}>
            {description}
          </p>
          {children}
        </div>
      </div>
    </section>
  );
}

function ToggleRow({
  id,
  name,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: "1px solid #e1e3e5",
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ color: "#6d7175" }}>{description}</div>
      </div>
      <Toggle
        id={id}
        name={name}
        checked={checked}
        onChange={onChange}
        label={title}
      />
    </div>
  );
}

function SettingsForm({
  data,
  saving,
  result,
  onCancel,
}: {
  data: SettingsData;
  saving: boolean;
  result: { ok: boolean; error: string | null } | undefined;
  onCancel: () => void;
}) {
  const [threshold, setThreshold] = useState(String(data.threshold));
  const [recipients, setRecipients] = useState(data.recipients);
  const [lowStockAlerts, setLowStockAlerts] = useState(data.lowStockAlerts);
  const [outOfStockAlerts, setOutOfStockAlerts] = useState(
    data.outOfStockAlerts,
  );
  return (
    <Form
      method="post"
      style={{ flex: "1 1 520px", minWidth: 0, display: "grid", gap: 16 }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <IconBubble bg="#e6f6ec">
            <Bell size={20} color="#30a46c" aria-hidden="true" />
          </IconBubble>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Low Stock Alert Settings</h2>
            <p style={{ margin: 0, color: "#6d7175" }}>
              Get notified when products are low in stock or run out of stock.
            </p>
          </div>
        </div>

        <SettingCard
          icon={<Boxes size={20} color="#7c5cfa" aria-hidden="true" />}
          iconBg="#efeafe"
          title="Low Stock Threshold"
          description="Products with this many units or fewer will be considered low in stock."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              name="threshold"
              min={0}
              max={10000}
              value={threshold}
              onChange={(event) => setThreshold(event.currentTarget.value)}
              aria-label="Low stock threshold"
              style={{ ...field, width: 110 }}
            />
            <span
              style={{ padding: "8px 12px", borderRadius: 8, background: "#f1f1f1" }}
            >
              units
            </span>
          </div>
        </SettingCard>

        <SettingCard
          icon={<Mail size={20} color="#3b82f6" aria-hidden="true" />}
          iconBg="#e6efff"
          title="Alert Recipients"
          description={`Send low stock and out of stock alerts to up to ${MAX_RECIPIENTS} email addresses.`}
        >
          <EmailChips
            value={recipients}
            onChange={setRecipients}
            max={MAX_RECIPIENTS}
          />
        </SettingCard>

        <SettingCard
          icon={<TriangleAlert size={20} color="#f5a623" aria-hidden="true" />}
          iconBg="#fff3dc"
          title="Alert Types"
          description="Choose which inventory alerts to receive."
        >
          <ToggleRow
            id="lowStockAlerts"
            name="lowStockAlerts"
            title="Low stock alerts"
            description={`Get notified when product inventory is at or below the threshold (≤ ${threshold || 0} units).`}
            checked={lowStockAlerts}
            onChange={setLowStockAlerts}
          />
          <ToggleRow
            id="outOfStockAlerts"
            name="outOfStockAlerts"
            title="Out of stock alerts"
            description="Get notified when a product's inventory reaches 0 units."
            checked={outOfStockAlerts}
            onChange={setOutOfStockAlerts}
          />
        </SettingCard>

      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
        }}
      >
        {result?.error && (
          <span role="alert" style={{ color: "#8e1f0b", marginRight: "auto" }}>
            {result.error}
          </span>
        )}
        {result?.ok && (
          <span style={{ color: "#0c5132", marginRight: "auto" }}>Saved.</span>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            ...field,
            background: "#fff",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: 8,
            background: "#2f9e44",
            color: "#fff",
            font: "inherit",
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </Form>
  );
}

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const [resetCount, setResetCount] = useState(0);

  return (
    <s-page heading="Settings">
      <div
        style={{
          padding: 16,
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <p style={{ margin: "0 0 16px", color: "#6d7175" }}>
          Manage alert rules, notifications, and app preferences.
        </p>

        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <SettingsForm
            key={`${resetCount}-${JSON.stringify(data)}`}
            data={data}
            saving={saving}
            result={result}
            onCancel={() => setResetCount((n) => n + 1)}
          />
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
