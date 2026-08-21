"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello, I'm Remus. Ask me anything about my work, projects, or tech stack.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const newMessages: Message[] = [
      ...messages,
      {
        role: "user",
        content: input.trim(),
      },
    ];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.answer) {
        const fallback =
          res.status === 429
            ? "I've reached my current request limit. Please try again shortly, or reach out via GitHub or LinkedIn in the meantime."
            : "Something went wrong processing that request. Please try again in a moment.";

        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: fallback,
          },
        ]);

        return;
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.answer,
        },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Something went wrong on my end. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <main className="chat-page">
      {/* Background terrain */}
      <div className="chat-background" aria-hidden="true">
        <svg
          viewBox="0 0 1440 700"
          preserveAspectRatio="none"
          className="chat-mountains"
        >
          <path
            d="
              M0 560
              L130 460
              L240 520
              L390 350
              L520 490
              L680 320
              L830 470
              L980 300
              L1120 450
              L1280 340
              L1440 430
              L1440 700
              L0 700
              Z
            "
          />

          <path
            d="
              M0 590
              C160 520 250 570 390 480
              C520 390 620 530 760 440
              C900 350 1020 500 1140 410
              C1270 320 1360 430 1440 390
            "
            fill="none"
          />
        </svg>
      </div>

      {/* Main chat shell */}
      <section className="chat-shell">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-brand">
            <div className="chat-logo">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 20L9 8L13 14L16 9L21 20H3Z" />
              </svg>
            </div>

            <div>
              <h1>Chat with Remus</h1>

              <div className="chat-status">
                <span className="status-dot" />
                <span>ONLINE</span>
              </div>
            </div>
          </div>

          <div className="chat-header-label">
            <span>PERSONAL SIGNAL</span>
          </div>
        </header>

        {/* Messages */}
        <div className="chat-messages">
          <div className="chat-intro">
            <span className="intro-line" />

            <p>
              Ask me about my <strong>projects, experience, skills,</strong> or
              the technologies I work with.
            </p>

            <span className="intro-line" />
          </div>

          <div className="message-list">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message-row ${
                  message.role === "user"
                    ? "message-row-user"
                    : "message-row-assistant"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="message-marker">
                    <span className="message-dot" />
                  </div>
                )}

                <div
                  className={`message ${
                    message.role === "user"
                      ? "message-user"
                      : "message-assistant"
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <p className="markdown-paragraph">{children}</p>
                      ),

                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="markdown-link"
                        >
                          {children}
                        </a>
                      ),

                      ul: ({ children }) => (
                        <ul className="markdown-list">{children}</ul>
                      ),

                      ol: ({ children }) => (
                        <ol className="markdown-list">{children}</ol>
                      ),

                      li: ({ children }) => (
                        <li className="markdown-list-item">{children}</li>
                      ),

                      code: ({ children }) => (
                        <code className="markdown-code">{children}</code>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}

            {loading && (
              <div className="message-row message-row-assistant">
                <div className="message-marker">
                  <span className="message-dot" />
                </div>

                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                  <label>Remus is thinking</label>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <footer className="chat-footer">
          <div className="input-wrapper">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me something..."
              disabled={loading}
              aria-label="Message"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 19V5" />
                <path d="M6 11L12 5L18 11" />
              </svg>
            </button>
          </div>

          <div className="input-hint">
            <span>ENTER</span>
            <span>to send</span>
          </div>
        </footer>
      </section>
    </main>
  );
}
