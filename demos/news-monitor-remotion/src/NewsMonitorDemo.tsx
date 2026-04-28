import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const p = {
  bg: "#050505",
  panel: "#0c0c0e",
  panel2: "#151518",
  text: "#f7f7f2",
  muted: "#aaa9a2",
  dim: "#696861",
  line: "rgba(255,255,255,0.13)",
  line2: "rgba(255,255,255,0.27)",
  gold: "#c9a84c",
  green: "#42d982",
  blue: "#7aa7ff",
};

const font = {
  sans: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif",
  mono: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeSoft = Easing.bezier(0.45, 0, 0.55, 1);

const inOut = (frame: number, enterStart: number, exitStart: number, enterDur = 24, exitDur = 22) => {
  const enter = interpolate(frame, [enterStart, enterStart + enterDur], [0, 1], {
    ...clamp,
    easing: easeOut,
  });
  const exit = interpolate(frame, [exitStart, exitStart + exitDur], [1, 0], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  return enter * exit;
};

const enter = (frame: number, start: number, duration = 24) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

const yFrom = (value: number, from: number) => interpolate(value, [0, 1], [from, 0]);

const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scan = interpolate(frame % (fps * 5), [0, fps * 5], [-520, 1980], clamp);
  return (
    <AbsoluteFill style={{ background: p.bg, color: p.text, fontFamily: font.sans }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 82% 12%, rgba(201,168,76,0.16), rgba(5,5,5,0) 34%), radial-gradient(circle at 8% 92%, rgba(255,255,255,0.07), rgba(5,5,5,0) 32%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.032) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.032) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0.1))",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: scan,
          width: 360,
          background:
            "linear-gradient(90deg, rgba(201,168,76,0), rgba(201,168,76,0.075), rgba(201,168,76,0))",
          pointerEvents: "none",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

const Headline: React.FC<{
  eyebrow: string;
  title: string;
  body?: string;
  width?: number;
  size?: number;
  bodySize?: number;
}> = ({ eyebrow, title, body, width = 760, size = 78, bodySize = 25 }) => {
  const frame = useCurrentFrame();
  const e1 = enter(frame, 6, 18);
  const e2 = enter(frame, 14, 24);
  const e3 = enter(frame, 28, 20);
  return (
    <div style={{ width }}>
      <div
        style={{
          color: p.gold,
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: e1,
          transform: `translateY(${yFrom(e1, 24)}px)`,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: size,
          lineHeight: 0.96,
          letterSpacing: "-0.065em",
          fontWeight: 850,
          opacity: e2,
          transform: `translateY(${yFrom(e2, 42)}px)`,
        }}
      >
        {title}
      </div>
      {body ? (
        <div
          style={{
            marginTop: 26,
            color: p.muted,
            fontSize: bodySize,
            lineHeight: 1.45,
            letterSpacing: "-0.02em",
            opacity: e3,
            transform: `translateY(${yFrom(e3, 30)}px)`,
          }}
        >
          {body}
        </div>
      ) : null}
    </div>
  );
};

const Window: React.FC<{
  title: string;
  width: number;
  height: number;
  children: React.ReactNode;
  delay?: number;
  tilt?: boolean;
  focusAt?: number;
}> = ({ title, width, height, children, delay = 18, tilt = false, focusAt }) => {
  const frame = useCurrentFrame();
  const e = enter(frame, delay, 24);
  const y = yFrom(e, 54);
  const focusIn =
    focusAt === undefined
      ? 0
      : interpolate(frame, [focusAt - 18, focusAt + 18], [0, 1], {
          ...clamp,
          easing: easeOut,
        });
  const focusOut =
    focusAt === undefined
      ? 1
      : interpolate(frame, [focusAt + 18, focusAt + 86], [1, 0], {
          ...clamp,
          easing: easeSoft,
        });
  const focus = focusIn * focusOut;
  const drift = tilt ? Math.sin(frame / 58) * 1.1 : 0;
  const scale = interpolate(e, [0, 1], [0.965, 1]) + focus * 0.072;
  const rotateY = tilt ? interpolate(e, [0, 1], [-16, -8]) - focus * 7 + drift : 0;
  const rotateX = tilt ? 5 + focus * 2.7 : 0;
  const translateX = focus * -42;
  const translateY = y + focus * -22;
  const translateZ = focus * 90;
  return (
    <div
      style={{
        width,
        height,
        border: `1px solid ${p.line2}`,
        borderRadius: 30,
        overflow: "hidden",
        background: "linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.025)), #09090a",
        boxShadow: `0 ${52 + focus * 24}px ${180 + focus * 90}px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.12)`,
        opacity: e,
        transform: `perspective(1400px) translate3d(${translateX}px, ${translateY}px, ${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${focus * -0.45}deg) scale(${scale})`,
        transformOrigin: "center",
      }}
    >
      <div
        style={{
          height: 58,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 22px",
          color: p.muted,
          borderBottom: `1px solid ${p.line}`,
          fontSize: 18,
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
        <span style={{ marginLeft: 14 }}>{title}</span>
      </div>
      <div style={{ height: height - 58, padding: 28 }}>{children}</div>
    </div>
  );
};

const Cursor: React.FC<{ x: number; y: number; start: number; clickAt?: number; scale?: number }> = ({
  x,
  y,
  start,
  clickAt = start + 26,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const e = enter(frame, start, 12);
  const click = interpolate(frame, [clickAt, clickAt + 6, clickAt + 16], [0, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: e,
        transform: `scale(${scale * (1 - click * 0.08)})`,
        filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.55))",
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "22px solid #fff",
          borderTop: "14px solid transparent",
          borderBottom: "14px solid transparent",
          transform: "rotate(42deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 22,
          top: 14,
          width: 54,
          height: 54,
          borderRadius: 999,
          border: `2px solid ${p.gold}`,
          opacity: click,
          transform: `translate(-50%, -50%) scale(${interpolate(click, [0, 1], [0.6, 1.45])})`,
        }}
      />
    </div>
  );
};

const FileIcon: React.FC<{ name: string; type: "cmd" | "env" | "md"; active?: boolean; delay: number }> = ({
  name,
  type,
  active = false,
  delay,
}) => {
  const frame = useCurrentFrame();
  const e = enter(frame, delay, 18);
  const color = type === "cmd" ? p.gold : type === "env" ? p.green : p.blue;
  return (
    <div
      style={{
        width: 168,
        height: 148,
        borderRadius: 24,
        border: `1px solid ${active ? "rgba(201,168,76,0.55)" : p.line}`,
        background: active ? "rgba(201,168,76,0.085)" : "rgba(255,255,255,0.035)",
        display: "grid",
        placeItems: "center",
        gap: 10,
        opacity: e,
        transform: `translateY(${yFrom(e, 32)}px) scale(${interpolate(e, [0, 1], [0.96, 1])})`,
      }}
    >
      <div
        style={{
          width: 54,
          height: 64,
          borderRadius: 12,
          border: `2px solid ${color}`,
          position: "relative",
          boxShadow: `0 0 32px ${color}22`,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            width: 18,
            height: 18,
            borderLeft: `2px solid ${color}`,
            borderBottom: `2px solid ${color}`,
            background: p.panel,
          }}
        />
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 18, color: active ? p.text : p.muted }}>{name}</div>
    </div>
  );
};

const FolderScene: React.FC = () => {
  return (
    <Window title="Explorer — C:\\Users\\you\\news-monitor" width={1040} height={620} delay={18} tilt focusAt={92}>
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 28, height: "100%" }}>
        <div style={{ borderRight: `1px solid ${p.line}`, color: p.muted, fontSize: 20, lineHeight: 2.25 }}>
          <div style={{ color: p.text, fontWeight: 800 }}>news-monitor</div>
          <div>apps</div>
          <div>packages</div>
          <div>docker</div>
          <div>docs</div>
          <div>scripts</div>
        </div>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 168px)", gap: 24 }}>
            <FileIcon name="README.md" type="md" delay={30} />
            <FileIcon name=".env.example" type="env" delay={36} />
            <FileIcon name="start-dev.cmd" type="cmd" active delay={42} />
            <FileIcon name="stop-dev.cmd" type="cmd" delay={48} />
            <FileIcon name="restart-web-worker.cmd" type="cmd" delay={54} />
          </div>
          <div
            style={{
              marginTop: 34,
              border: `1px solid ${p.line}`,
              borderRadius: 18,
              padding: 18,
              color: p.muted,
              fontSize: 19,
              lineHeight: 1.55,
            }}
          >
            一键启动脚本会检查环境、创建 .env、启动 Docker 依赖、执行迁移，并打开 Web。
          </div>
        </div>
      </div>
      <Cursor x={650} y={218} start={68} clickAt={92} scale={1.45} />
    </Window>
  );
};

const TerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const rows = [
    ["[1/9]", "Checking required tools", "ok"],
    ["[2/9]", "Creating .env from .env.example", "ok"],
    ["[3/9]", "Installing dependencies", "ok"],
    ["[4/9]", "Starting Docker dependencies", "postgres · redis · rsshub"],
    ["[5/9]", "Running database migrations", "done"],
    ["[6/9]", "Starting local web and worker", "running"],
    ["[7/9]", "Waiting for web UI", "http://localhost:3000"],
    ["[8/9]", "Printing runtime status", "AI_MODE=core"],
    ["[9/9]", "Opening browser", "ready"],
  ];
  return (
    <Window title="PowerShell — start-dev.cmd" width={1050} height={710} delay={12} tilt focusAt={138}>
      <div style={{ fontFamily: font.mono }}>
        <div style={{ color: p.gold, fontSize: 24, marginBottom: 20 }}>news-monitor one-click startup</div>
        {rows.map(([step, label, value], index) => {
          const e = enter(frame, 24 + index * 12, 10);
          return (
            <div
              key={step}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr 260px",
                gap: 18,
                padding: "12px 0",
                borderTop: `1px solid ${p.line}`,
                fontSize: 21,
                opacity: e,
                transform: `translateX(${interpolate(e, [0, 1], [26, 0])}px)`,
              }}
            >
              <span style={{ color: p.dim }}>{step}</span>
              <span style={{ color: p.text }}>{label}</span>
              <span style={{ color: index >= 6 ? p.gold : p.green }}>{value}</span>
            </div>
          );
        })}
      </div>
    </Window>
  );
};

const DashboardScene: React.FC<{ showDrawer?: boolean }> = ({ showDrawer = false }) => {
  const frame = useCurrentFrame();
  const cards = [
    { tag: "正在升温", title: "DeepSeek-V4 发布信号上升", meta: "17 个来源 · 4 类平台 · 24h" },
    { tag: "已被确认", title: "GPT-5.5 编码能力更新", meta: "31 个来源 · 高质量源覆盖" },
    { tag: "我的订阅", title: "Karpathy / HN / OpenAI", meta: "高频动态自动折叠" },
  ];
  const drawer = enter(frame, 86, 22);
  return (
    <Window title="localhost:3000 — 总编台" width={1160} height={720} delay={16} tilt focusAt={showDrawer ? 84 : 96}>
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 26, height: "100%" }}>
        <div style={{ borderRight: `1px solid ${p.line}`, paddingRight: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 850, letterSpacing: "-0.045em" }}>news-monitor</div>
          {["总编台", "信源库", "推荐信源", "运营", "设置"].map((item, index) => (
            <div
              key={item}
              style={{
                marginTop: index === 0 ? 40 : 20,
                color: index === 0 ? p.text : p.muted,
                fontSize: 21,
              }}
            >
              {item}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
            <div>
              <div style={{ color: p.muted, fontSize: 18 }}>黑白情报总编台</div>
              <div style={{ fontSize: 58, lineHeight: 1, fontWeight: 850, letterSpacing: "-0.065em" }}>值得关注</div>
            </div>
            <div style={{ border: `1px solid ${p.line}`, borderRadius: 999, padding: "11px 16px", color: p.muted }}>
              24H · 72H · 7D · 30D
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16, marginTop: 32 }}>
            {cards.map((card, index) => {
              const e = enter(frame, 46 + index * 9, 18);
              return (
                <div
                  key={card.title}
                  style={{
                    minHeight: index === 0 ? 270 : 126,
                    gridRow: index === 0 ? "span 2" : undefined,
                    borderRadius: 24,
                    border: `1px solid ${index === 0 ? "rgba(201,168,76,0.45)" : p.line}`,
                    background: index === 0 ? "rgba(201,168,76,0.085)" : "rgba(255,255,255,0.035)",
                    padding: 24,
                    opacity: e,
                    transform: `translateY(${yFrom(e, 30)}px)`,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ color: p.gold, fontWeight: 800, fontSize: 18 }}>{card.tag}</span>
                  <div>
                    <div style={{ fontSize: index === 0 ? 40 : 26, fontWeight: 850, lineHeight: 1.05, letterSpacing: "-0.045em" }}>
                      {card.title}
                    </div>
                    <div style={{ marginTop: 14, color: p.muted, fontSize: 18 }}>{card.meta}</div>
                    {index === 0 ? (
                      <div
                        style={{
                          marginTop: 22,
                          display: "inline-flex",
                          border: `1px solid ${p.line2}`,
                          borderRadius: 999,
                          padding: "9px 14px",
                          fontSize: 17,
                        }}
                      >
                        查看来源
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {showDrawer ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 380,
                borderLeft: `1px solid ${p.line2}`,
                background: "rgba(10,10,11,0.96)",
                padding: 24,
                opacity: drawer,
                transform: `translateX(${interpolate(drawer, [0, 1], [80, 0])}px)`,
              }}
            >
              <div style={{ color: p.gold, fontWeight: 800, letterSpacing: "0.14em", fontSize: 14 }}>SOURCE COVERAGE</div>
              <div style={{ marginTop: 18, fontSize: 30, fontWeight: 850, lineHeight: 1.05 }}>其它来源也在报道</div>
              {["OpenAI News", "Hacker News", "Karpathy", "机器之心"].map((name, index) => (
                <div
                  key={name}
                  style={{
                    marginTop: 18,
                    borderTop: `1px solid ${p.line}`,
                    paddingTop: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    color: index === 0 ? p.text : p.muted,
                    fontSize: 19,
                  }}
                >
                  <span>{name}</span>
                  <span style={{ color: p.green }}>matched</span>
                </div>
              ))}
            </div>
          ) : null}
          {showDrawer ? <Cursor x={454} y={374} start={68} clickAt={84} scale={1.25} /> : null}
        </div>
      </div>
    </Window>
  );
};

const SourceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sources = ["OpenAI News", "Anthropic Blog", "DeepSeek", "Hacker News", "Karpathy", "机器之心"];
  return (
    <Window title="localhost:3000 — 推荐信源" width={1120} height={670} delay={16} tilt focusAt={98}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <div style={{ color: p.muted, fontSize: 20 }}>高价值 AI 信源</div>
          <div style={{ marginTop: 10, fontSize: 58, fontWeight: 850, letterSpacing: "-0.06em" }}>导入公共雷达</div>
        </div>
        <div
          style={{
            background: p.text,
            color: p.bg,
            borderRadius: 999,
            padding: "15px 22px",
            fontWeight: 850,
            fontSize: 20,
          }}
        >
          导入预设
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginTop: 38 }}>
        {sources.map((source, index) => {
          const e = enter(frame, 48 + index * 7, 16);
          const imported = enter(frame, 105 + index * 3, 10);
          return (
            <div
              key={source}
              style={{
                minHeight: 136,
                borderRadius: 22,
                border: `1px solid ${p.line}`,
                background: "rgba(255,255,255,0.035)",
                padding: 20,
                opacity: e,
                transform: `translateY(${yFrom(e, 24)}px)`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 24, fontWeight: 850 }}>{source}</div>
                <div style={{ width: 12, height: 12, borderRadius: 99, background: p.green }} />
              </div>
              <div style={{ marginTop: 20, color: imported > 0.5 ? p.green : p.muted, fontSize: 18 }}>
                {imported > 0.5 ? "已在库中" : "点击添加到信源库"}
              </div>
            </div>
          );
        })}
      </div>
      <Cursor x={936} y={92} start={76} clickAt={98} scale={1.35} />
    </Window>
  );
};

const PipelineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const rows = [
    ["fetch-source", "RSS / X / HN / WeWe", "healthy"],
    ["extract-keywords", "DeepSeek-V4 · GPT-5.5 · Codex", "updated"],
    ["cluster-events", "same topic, multiple sources", "matched"],
    ["attention-rank", "velocity + source coverage", "ready"],
  ];
  return (
    <Window title="Core Engine — processing pipeline" width={1060} height={560} delay={16} tilt focusAt={92}>
      <div style={{ fontFamily: font.mono, fontSize: 23 }}>
        {rows.map(([name, detail, status], index) => {
          const e = enter(frame, 34 + index * 18, 14);
          return (
            <div
              key={name}
              style={{
                display: "grid",
                gridTemplateColumns: "260px 1fr 180px",
                gap: 22,
                borderTop: `1px solid ${p.line}`,
                padding: "20px 0",
                opacity: e,
                transform: `translateX(${interpolate(e, [0, 1], [34, 0])}px)`,
              }}
            >
              <span style={{ color: p.gold }}>{name}</span>
              <span>{detail}</span>
              <span style={{ color: p.green }}>{status}</span>
            </div>
          );
        })}
      </div>
    </Window>
  );
};

const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = enter(frame, 10, 20);
  return (
    <Background>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 150 }}>
        <div>
          <div
            style={{
              margin: "0 auto 46px",
              width: 138,
              height: 138,
              borderRadius: 34,
              border: `1px solid ${p.line2}`,
              background: "rgba(255,255,255,0.045)",
              position: "relative",
              opacity: mark,
              transform: `scale(${interpolate(mark, [0, 1], [0.84, 1])})`,
            }}
          >
            <div style={{ position: "absolute", left: 50, top: 36, width: 9, height: 66, borderRadius: 99, background: p.text, transform: "rotate(-24deg)" }} />
            <div style={{ position: "absolute", right: 50, top: 36, width: 9, height: 66, borderRadius: 99, background: p.text, opacity: 0.72, transform: "rotate(24deg)" }} />
          </div>
          <div style={{ color: p.gold, fontSize: 23, fontWeight: 850, letterSpacing: "0.22em", textTransform: "uppercase", opacity: enter(frame, 24, 18) }}>
            news-monitor
          </div>
              <div
                style={{
                  marginTop: 28,
                  maxWidth: 1060,
                  fontSize: 76,
                  lineHeight: 1,
                  letterSpacing: "-0.055em",
                  fontWeight: 850,
                  opacity: enter(frame, 34, 24),
                  transform: `translateY(${yFrom(enter(frame, 34, 24), 46)}px)`,
            }}
          >
            自托管的多信源“值得关注”发现引擎。
          </div>
          <div style={{ marginTop: 40, display: "flex", justifyContent: "center", gap: 14, opacity: enter(frame, 62, 20) }}>
            {["双击启动", "导入信源", "发现信号", "本地诊断"].map((item) => (
              <div key={item} style={{ border: `1px solid ${p.line}`, borderRadius: 999, padding: "13px 20px", color: p.muted, fontSize: 20 }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Background>
  );
};

const Shot: React.FC<{ from: number; duration: number; children: React.ReactNode }> = ({ from, duration, children }) => {
  const frame = useCurrentFrame();
  const opacity = inOut(frame - from, 0, duration - 26, 18, 26);
  const scale = interpolate(opacity, [0, 1], [1.012, 1]);
  return (
    <Sequence from={from} durationInFrames={duration} premountFor={30}>
      <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>
    </Sequence>
  );
};

export const NewsMonitorDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      <Shot from={0} duration={220}>
        <Background>
          <div style={{ position: "absolute", left: 124, top: 156 }}>
            <Headline
              eyebrow="GitHub to Local"
              title="双击启动项目"
              body="新用户不需要先理解架构。README、环境模板和 start-dev.cmd 给出最短路径。"
              width={590}
              size={62}
              bodySize={23}
            />
          </div>
          <div style={{ position: "absolute", right: 86, top: 214 }}>
            <FolderScene />
          </div>
        </Background>
      </Shot>

      <Shot from={190} duration={270}>
        <Background>
          <div style={{ position: "absolute", left: 128, top: 188 }}>
            <Headline
              eyebrow="One-click startup"
              title="启动过程必须可见。"
              body="Docker、迁移、Web、worker，每一步都明确告诉用户现在发生了什么。"
              width={620}
              size={62}
              bodySize={23}
            />
          </div>
          <div style={{ position: "absolute", right: 120, top: 154 }}>
            <TerminalScene />
          </div>
        </Background>
      </Shot>

      <Shot from={430} duration={260}>
        <Background>
          <div style={{ position: "absolute", left: 120, top: 122 }}>
            <DashboardScene />
          </div>
          <div style={{ position: "absolute", right: 110, bottom: 104 }}>
            <Headline
              eyebrow="Web Console"
              title="总编台成为主画面。"
              body="镜头推进到时间窗、值得关注和来源覆盖，用户动作直接落在产品结果上。"
              width={520}
              size={54}
              bodySize={22}
            />
          </div>
        </Background>
      </Shot>

      <Shot from={660} duration={260}>
        <Background>
          <div style={{ position: "absolute", left: 126, top: 170 }}>
            <Headline
              eyebrow="Source Library"
              title="导入高价值信源。"
              body="官方、作者、社区、中文源进入公共雷达；个人源保留个人视角。"
              width={570}
              size={60}
              bodySize={22}
            />
          </div>
          <div style={{ position: "absolute", right: 120, top: 190 }}>
            <SourceScene />
          </div>
        </Background>
      </Shot>

      <Shot from={890} duration={250}>
        <Background>
          <div style={{ position: "absolute", left: 126, top: 180 }}>
            <PipelineScene />
          </div>
          <div style={{ position: "absolute", right: 126, top: 210 }}>
            <Headline
              eyebrow="Core Engine"
              title="不依赖 LLM，也能完成发现链路。"
              body="抓取、关键词、聚类、排序都走确定性主链路。LLM 只是增强。"
              width={560}
              size={56}
              bodySize={22}
            />
          </div>
        </Background>
      </Shot>

      <Shot from={1110} duration={280}>
        <Background>
          <div style={{ position: "absolute", left: 118, top: 122 }}>
            <DashboardScene showDrawer />
          </div>
          <div style={{ position: "absolute", right: 108, bottom: 108 }}>
            <Headline
              eyebrow="Explainable attention"
              title="点击查看来源。"
              body="同一事件被哪些不同信源提及，为什么值得关注，用户能直接看见。"
              width={520}
              size={56}
              bodySize={22}
            />
          </div>
        </Background>
      </Shot>

      <Shot from={1370} duration={430}>
        <ClosingScene />
      </Shot>
    </AbsoluteFill>
  );
};
