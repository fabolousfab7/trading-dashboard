interface AllocBarProps {
  value: number
}

export default function AllocBar({ value }: AllocBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 4, background: "var(--rule)" }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: "100%", background: "var(--at-accent)" }} />
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
        fontSize: 11, color: "var(--ink2)", minWidth: 38, textAlign: "right",
      }}>
        {value.toFixed(1)} %
      </span>
    </div>
  )
}
