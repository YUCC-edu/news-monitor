export default function DashboardPage() {
  return (
    <div>
      <header
        style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>精选时间轴</h1>
        <span style={{ marginLeft: 12, color: "#5b6478", fontSize: 12 }}>
          M0 占位 · 暂无数据，去 信源 添加你的第一个源
        </span>
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
        暂无内容
      </div>
    </div>
  );
}
