

export function Kpi({
  label,
  value,
  note,
  icon,
  iconBg,
  badge,
}: {
  label: string;
  value: string | number;
  note?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  badge?: { text: string; color: string; background: string };
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px", background: "#fff",  border: "1px solid #e1e3e5",  borderRadius: "12px"}}>
      {icon && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: iconBg ?? "#f1f1f1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <div>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
        <div>{label}</div>
        {badge && (
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              padding: "2px 10px",
              borderRadius: 999,
              background: badge.background,
              color: badge.color,
            }}
          >
            {badge.text}
          </span>
        )}
        {note && <div style={{ color: "#6d7175", marginTop: 4 }}>{note}</div>}
      </div>
    </div>
  );
}