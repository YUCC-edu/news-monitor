export function Placeholder({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <header
        style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>{title}</h1>
        {hint && (
          <span style={{ marginLeft: 12, color: "#5b6478", fontSize: 12 }}>
            {hint}
          </span>
        )}
      </header>
      <div
        style={{
          border: "1px dashed #2a2f3d",
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          color: "#5b6478",
        }}
      >
        即将到来
      </div>
    </div>
  );
}
