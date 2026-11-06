import { useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailChips({
  value,
  onChange,
  max = 5,
  name = "recipient",
}: {
  value: string[];
  onChange: (emails: string[]) => void;
  max?: number;
  name?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[\s,;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;

    const next = [...value];
    for (const email of parts) {
      if (!EMAIL.test(email)) {
        setError(`${email} is not a valid email address.`);
        return;
      }
      if (next.includes(email)) continue;
      if (next.length >= max) {
        setError(`You can add up to ${max} addresses.`);
        return;
      }
      next.push(email);
    }
    onChange(next);
    setDraft("");
    setError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ([",", ";", " ", "Enter"].includes(event.key)) {
      if (draft.trim()) {
        event.preventDefault();
        commit(draft);
      }
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
          padding: 6,
          border: "1px solid #dddcdc",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        {value.map((email) => (
          <span
            key={email}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 4px 3px 10px",
              borderRadius: 6,
              background: "#f1f1f1",
            }}
          >
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onChange(value.filter((e) => e !== email))}
              style={{
                display: "inline-flex",
                border: "none",
                background: "transparent",
                padding: 2,
                cursor: "pointer",
                color: "inherit",
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder="Add email address..."
          aria-label="Add email address"
          style={{
            flex: "1 1 160px",
            minWidth: 140,
            border: "none",
            padding: "4px 6px",
            font: "inherit",
            background: "transparent",
          }}
        />
      </div>
      {error && (
        <p role="alert" style={{ margin: "6px 0 0", color: "#8e1f0b" }}>
          {error}
        </p>
      )}
      {value.map((email) => (
        <input key={email} type="hidden" name={name} value={email} />
      ))}
    </div>
  );
}