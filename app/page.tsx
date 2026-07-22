"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleAsk() {
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch (err) {
      setAnswer("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif" }}
    >
      <h1>Document Q&A (RAG)</h1>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask something about your document..."
        rows={3}
        style={{ width: "100%", padding: 8, fontSize: 16 }}
      />
      <button
        onClick={handleAsk}
        disabled={loading || !question}
        style={{ marginTop: 10, padding: "8px 16px" }}
      >
        {loading ? "Thinking..." : "Ask"}
      </button>

      {answer && (
        <div style={{ marginTop: 20 }}>
          <h3>Answer</h3>
          <ReactMarkdown>{answer}</ReactMarkdown>
          <h4>Sources</h4>
          <ul>
            {sources.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: "#555" }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
