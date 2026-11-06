import { useState } from "react";

export function Toggle({
  id,
  name,
  checked,
  onChange,
  label,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <label
      htmlFor={id}
      style={{
        position: "relative",
        display: "inline-block",
        width: 40,
        height: 22,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        name={name}
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          opacity: 0,
          cursor: "pointer",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          background: checked ? "#2f9e44" : "#c9cccf",
          boxShadow: focused ? "0 0 0 2px #fff, 0 0 0 4px #6d5ce7" : "none",
          transition: "background 0.15s",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
          transition: "left 0.15s",
        }}
      />
    </label>
  );
}