import { Check, Shirt } from "lucide-react";

export function Illustration({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: "relative", width: 320, height: 200, flexShrink: 0 }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 50px 0 0",
          border: `2px solid #2f9e44`,
          borderRadius: 14,
          background: "#fff",
          padding: 14,
        }}
      >
        <div
          style={{
            height: 8,
            width: 100,
            background: "#e8ecef",
            borderRadius: 4,
            marginBottom: 12,
          }}
        />
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              width: 90,
              height: 110,
              borderRadius: 10,
              background: "#f1f3f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shirt size={44} color="#9aa5b1" />
          </div>
          <div style={{ flex: 1, display: "grid", gap: 8, alignContent: "start" }}>
            {[80, 60, 70, 40].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 8,
                  width: `${w}%`,
                  background: "#e8ecef",
                  borderRadius: 4,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: 12,
          display: "grid",
          gap: 8,
          padding: "10px 12px",
          background: "#fff",
          border: "1px solid #e1e3e5",
          borderRadius: 12,
          boxShadow: "0 6px 18px rgba(0, 0, 0, 0.1)",
          fontSize: 13,
        }}
      >
        {["Product content", "SEO details", "Inventory alerts"].map((label) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#2f9e44",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={12} color="#fff" strokeWidth={3} />
            </span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
