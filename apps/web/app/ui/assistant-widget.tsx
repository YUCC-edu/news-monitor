"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { shouldAutoScrollToBottom } from "@/lib/assistant-canned";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Drawer } from "./drawer";

type ChatTrace = {
  tool: string;
  ok: boolean;
  data?: unknown;
};

type ActionCard = {
  id: string;
  tool: string;
  label: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  mode?: "execute" | "navigate";
  targetPath?: string;
};

type AssistantResponse = {
  ok: boolean;
  requestId: string;
  stage?: string;
  answer?: string;
  error?: string;
  suggestions?: string[];
  traces?: ChatTrace[];
  actions?: ActionCard[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  pending?: boolean;
  stage?: string;
  requestId?: string;
  traces?: ChatTrace[];
  actions?: ActionCard[];
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const SESSION_STORE_KEY = "nm_assistant_sessions_v1";
const LAYOUT_STORE_KEY = "nm_assistant_layout_v1";

function makeSession(title = "新会话"): ChatSession {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    updatedAt: Date.now(),
    messages: [
      {
        id: "welcome",
        role: "assistant",
        text: "你好，我是 NM。你可以问我热点统计、信源健康，或让我帮你新增信源。",
        createdAt: Date.now(),
      },
    ],
  };
}

export function AssistantWidget({ pagePath }: { pagePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<ActionCard | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [drawerWidth, setDrawerWidth] = useState(860);
  const [sessionPaneWidth, setSessionPaneWidth] = useState(220);
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatSession[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0]!.id);
          return;
        }
      }
    } catch {
      // ignore invalid persisted state
    }
    const initial = makeSession("当前会话");
    setSessions([initial]);
    setActiveSessionId(initial.id);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        drawerWidth?: number;
        sessionPaneWidth?: number;
        compactMode?: boolean;
      };
      if (typeof parsed.drawerWidth === "number") setDrawerWidth(parsed.drawerWidth);
      if (typeof parsed.sessionPaneWidth === "number") setSessionPaneWidth(parsed.sessionPaneWidth);
      if (typeof parsed.compactMode === "boolean") setCompactMode(parsed.compactMode);
    } catch {
      // ignore invalid layout state
    }
  }, []);

  useEffect(() => {
    if (sessions.length === 0) return;
    localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(sessions.slice(0, 20)));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(
      LAYOUT_STORE_KEY,
      JSON.stringify({
        drawerWidth,
        sessionPaneWidth,
        compactMode,
      }),
    );
  }, [drawerWidth, sessionPaneWidth, compactMode]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? makeSession("当前会话");
  const messages = activeSession.messages;
  const canSend = input.trim().length > 0 && !loading;

  function updateActiveSession(mutator: (session: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSession.id) return s;
        return mutator(s);
      }),
    );
  }

  function appendMessage(msg: ChatMessage) {
    updateActiveSession((session) => {
      const nextMessages = [...session.messages, msg];
      const title =
        session.title === "新会话" || session.title === "当前会话"
          ? msg.role === "user"
            ? msg.text.slice(0, 24)
            : session.title
          : session.title;
      return {
        ...session,
        title,
        updatedAt: Date.now(),
        messages: nextMessages,
      };
    });
  }

  function replaceMessage(messageId: string, next: ChatMessage) {
    updateActiveSession((session) => ({
      ...session,
      updatedAt: Date.now(),
      messages: session.messages.map((m) => (m.id === messageId ? next : m)),
    }));
  }

  function createNewSession() {
    const session = makeSession();
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setInput("");
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      setStickToBottom(
        shouldAutoScrollToBottom({
          scrollTop: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }),
      );
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, activeSessionId]);

  useEffect(() => {
    if (!open || !stickToBottom) return;
    scrollToBottom("smooth");
  }, [messages, loading, open, stickToBottom, activeSessionId]);

  const quickPrompts = useMemo(
    () => [
      "帮我生成近7天统计摘要",
      "查看当前信源健康状态",
      "帮我新增 RSS 信源 https://example.com/feed.xml",
    ],
    [],
  );

  async function sendMessage(message: string) {
    if (!message.trim()) return;
    setLoading(true);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: message,
      createdAt: Date.now(),
    };
    const pendingId = `a-pending-${Date.now()}`;
    appendMessage(userMsg);
    appendMessage({
      id: pendingId,
      role: "assistant",
      text: "NM 正在处理...",
      pending: true,
      stage: "executing",
      createdAt: Date.now(),
    });
    setInput("");
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          pageContext: { path: pagePath },
        }),
      });
      const data = (await response.json()) as AssistantResponse;
      replaceMessage(pendingId, {
        id: `a-${Date.now()}`,
        role: "assistant",
        createdAt: Date.now(),
        requestId: data.requestId,
        stage: data.stage ?? "reported",
        text: data.ok
          ? data.answer ?? "已完成。"
          : `执行失败：${data.error ?? "unknown error"}\n${
              data.suggestions?.length ? `建议：\n- ${data.suggestions.join("\n- ")}` : ""
            }`,
        traces: data.traces ?? [],
        actions: data.actions ?? [],
      });
    } catch (error) {
      replaceMessage(pendingId, {
        id: `a-${Date.now()}`,
        role: "assistant",
        createdAt: Date.now(),
        stage: "reported",
        text: `请求失败：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndRunAction(action: ActionCard) {
    if (action.mode === "navigate" && action.targetPath) {
      setPendingAction(null);
      router.push(action.targetPath);
      return;
    }
    setPendingAction(null);
    setLoading(true);
    const pendingId = `a-pending-${Date.now()}`;
    appendMessage({
      id: pendingId,
      role: "assistant",
      text: `正在执行 ${action.label}...`,
      pending: true,
      stage: "executing",
      createdAt: Date.now(),
    });
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-assistant-role": "assistant_write_low",
        },
        body: JSON.stringify({
          action: { tool: action.tool, args: action.args, confirm: true },
          pageContext: { path: pagePath },
        }),
      });
      const data = (await res.json()) as AssistantResponse;
      replaceMessage(pendingId, {
        id: `a-${Date.now()}`,
        role: "assistant",
        createdAt: Date.now(),
        requestId: data.requestId,
        stage: data.stage ?? "reported",
        text: data.ok
          ? data.answer ?? "操作已执行。"
          : `执行失败：${data.error ?? "unknown error"}\n${
              data.suggestions?.length ? `建议：\n- ${data.suggestions.join("\n- ")}` : ""
            }`,
        traces: data.traces ?? [],
        actions: data.actions ?? [],
      });
    } catch (error) {
      replaceMessage(pendingId, {
        id: `a-${Date.now()}`,
        role: "assistant",
        createdAt: Date.now(),
        stage: "reported",
        text: `执行失败：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开 NM 助手"
        className="nm-assistant-fab"
      >
        <span className="nm-assistant-fab__dot" />
        <span>NM</span>
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="NM 助手" width={drawerWidth}>
        <div
          className={`nm-chat-shell ${compactMode ? "nm-chat-shell--compact" : ""}`}
          style={{ gridTemplateColumns: `${sessionPaneWidth}px 1fr` }}
        >
          <div className="nm-chat-layout-controls">
            <label className="nm-chat-layout-controls__item">
              <span>面板宽度</span>
              <input
                type="range"
                min={560}
                max={1100}
                step={20}
                value={drawerWidth}
                onChange={(e) => setDrawerWidth(Number(e.target.value))}
              />
            </label>
            <label className="nm-chat-layout-controls__item">
              <span>会话栏宽度</span>
              <input
                type="range"
                min={150}
                max={340}
                step={10}
                value={sessionPaneWidth}
                onChange={(e) => setSessionPaneWidth(Number(e.target.value))}
              />
            </label>
            <Button size="sm" variant={compactMode ? "primary" : "ghost"} onClick={() => setCompactMode((v) => !v)}>
              {compactMode ? "紧凑模式: 开" : "紧凑模式: 关"}
            </Button>
          </div>
          <aside className="nm-chat-sessions">
            <div className="nm-chat-sessions__header">
              <div className="nm-chat-sessions__title">会话</div>
              <Button size="sm" variant="ghost" onClick={createNewSession}>
                + 新建
              </Button>
            </div>
            <div className="nm-chat-sessions__list">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`nm-chat-session-item ${
                    session.id === activeSession.id ? "nm-chat-session-item--active" : ""
                  }`}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span className="nm-chat-session-item__title">{session.title}</span>
                  <span className="nm-chat-session-item__meta">
                    {new Date(session.updatedAt).toLocaleTimeString()}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="nm-chat-main">
            <div ref={listRef} className="nm-chat-message-pane">
              {messages.map((m) => (
                <article
                  key={m.id}
                  className={`nm-chat-msg ${m.role === "user" ? "nm-chat-msg--user" : "nm-chat-msg--assistant"}`}
                >
                  <div className="nm-chat-msg__meta">
                    <span>{m.role === "user" ? "你" : "NM"}</span>
                    {m.stage ? <span>· {m.stage}</span> : null}
                    {m.pending ? <span>· 处理中</span> : null}
                  </div>
                  <div className="nm-chat-msg__bubble">
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                    {m.requestId ? <div className="nm-chat-msg__rid">requestId: {m.requestId}</div> : null}
                    {m.actions && m.actions.length > 0 ? (
                      <details className="nm-chat-actions">
                        <summary>可执行操作（{m.actions.length}）</summary>
                        <div className="nm-chat-actions__row">
                          {m.actions.map((action) => (
                            <Button
                              key={action.id}
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                if (action.mode === "navigate" && action.targetPath) {
                                  router.push(action.targetPath);
                                  return;
                                }
                                if (!action.requiresConfirmation) {
                                  void confirmAndRunAction(action);
                                  return;
                                }
                                setPendingAction(action);
                              }}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>

            {!stickToBottom ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setStickToBottom(true);
                    scrollToBottom("smooth");
                  }}
                >
                  回到底部
                </Button>
              </div>
            ) : null}

            <div className="nm-chat-composer">
              <div className="nm-chat-prompts">
                {quickPrompts.map((q) => (
                  <button key={q} type="button" className="nm-chat-prompt-btn" onClick={() => void sendMessage(q)}>
                    {q}
                  </button>
                ))}
              </div>
              <div className="nm-chat-composer__box">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="向 NM 提问，Enter 发送，Shift+Enter 换行"
                  className="nm-chat-composer__input"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && canSend) {
                      e.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                />
                <div className="nm-chat-composer__footer">
                  <span className="nm-muted">{loading ? "NM 正在处理中..." : "准备就绪"}</span>
                  <Button disabled={!canSend} variant="primary" onClick={() => void sendMessage(input)}>
                    发送
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </Drawer>

      <Dialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title="确认执行操作"
      >
        <p className="nm-muted" style={{ fontSize: 13 }}>
          该操作会修改系统状态，是否继续？
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => setPendingAction(null)}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => pendingAction && void confirmAndRunAction(pendingAction)}
          >
            确认执行
          </Button>
        </div>
      </Dialog>
    </>
  );
}
