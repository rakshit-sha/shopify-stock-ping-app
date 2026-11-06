import { Bell, HeartPulse, Settings } from "lucide-react";

export const APP_FEATURES = [
  {
    to: "/app/audit",
    title: "Store Health",
    text: "Get an overall health score for your store and quickly see what needs attention.",
    icon: HeartPulse,
    color: "#30a46c",
    bg: "#e6f6ec",
  },
  {
    to: "/app/low-stock",
    title: "Low Stock Alerts",
    text: "Get notified when products are low in stock or out of stock via email.",
    icon: Bell,
    color: "#f5a623",
    bg: "#fff3dc",
  },
  {
    to: "/app/settings",
    title: "Settings",
    text: "Configure alert thresholds, email recipients, and other app preferences.",
    icon: Settings,
    color: "#7c5cfa",
    bg: "#efeafe",
  },
];