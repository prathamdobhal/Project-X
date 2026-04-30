// src/pages/ChatPage.tsx
import React, { useEffect, useRef, useState } from "react";
import "./ChatPage.css";

/** ===================== Chat & Plot Services ===================== **/
class ChatService {
  private apiKey: string;
  private apiUrl: string = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  private model: string = "gemini-2.0-flash";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(messages: { role: string; content: string }[], model: string = "gemini-2.0-flash-exp") {
    try {
      // Convert OpenAI-style messages to Gemini format
      const geminiContents = this.convertToGeminiFormat(messages);
      
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey.trim()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error?.message || `API Error: ${response.status}`;
        throw new Error(errorMsg);
      }

      const aiMessage = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
      return { success: true, message: aiMessage };
    } catch (error: any) {
      return { success: false, error: this.handleError(error) };
    }
  }

  private convertToGeminiFormat(messages: { role: string; content: string }[]) {
    const geminiContents: any[] = [];
    let systemPrompt = "";

    // Extract system prompt and convert messages
    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += msg.content + "\n\n";
      } else if (msg.role === "user") {
        geminiContents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        geminiContents.push({
          role: "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Prepend system prompt to first user message if exists
    if (systemPrompt && geminiContents.length > 0 && geminiContents[0].role === "user") {
      geminiContents[0].parts[0].text = systemPrompt + geminiContents[0].parts[0].text;
    }

    return geminiContents;
  }

  private handleError(error: any): string {
    const msg = error?.message ?? String(error);
    if (msg.includes("401") || msg.includes("403")) return "Invalid API key. Please check your credentials.";
    if (msg.includes("429")) return "Rate limit exceeded. Please wait and try again.";
    if (msg.includes("500") || msg.includes("503")) return "Gemini server error. Please try again later.";
    return "Error: " + msg;
  }
}

class PlottingService {
  private apiUrl: string = import.meta.env.VITE_FLASK_URL || "http://localhost:5000/plot";

  // Accept optional datasetCsv so the plotting backend can use the dataset sample/full CSV
  async generatePlot(plotCode: string, datasetCsv?: string) {
    try {
      const payload: any = { code: plotCode };
      if (datasetCsv) payload.dataset_csv = datasetCsv;

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let err = "Failed to generate plot";
        try {
          const json = await response.json();
          err = json.error || err;
        } catch {}
        throw new Error(err);
      }
      const data = await response.json();
      return { success: true, image: data.image };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  detectPlotRequest(message: string) {
    const keywords = [
      "plot",
      "chart",
      "graph",
      "visualize",
      "bar",
      "line",
      "scatter",
      "histogram",
      "matplotlib",
      "seaborn",
    ];
    return keywords.some((k) => message.toLowerCase().includes(k));
  }

  extractPlotCode(aiResponse: string): string | null {
    const pythonBlock = /```python\s*([\s\S]*?)```/i.exec(aiResponse);
    if (pythonBlock) return pythonBlock[1].trim();
    const codeBlock = /```\s*([\s\S]*?)```/.exec(aiResponse);
    if (codeBlock) {
      const code = codeBlock[1].trim();
      if (code.includes("plt.") || code.includes("pd.") || code.includes("sns.")) return code;
    }
    return null;
  }
}

/** ===================== Constants & Utils ===================== **/
const YOUR_API_KEY = "AIzaSyDzuwlaP_V610VTl6M-vTEb5ifsj8inTx0"; // Replace with your Gemini API key
const MODEL = "gemini-2.0-flash";
const SYSTEM_PROMPT = `You are Ops CoPilot — an AI-powered assistant.
Your role is to act as a domain-specialized operations chatbot that answers natural-language questions about mining or manufacturing datasets,
performs analysis, and returns tables, charts, or summaries based on structured (CSV/MySQL/Timestream) and unstructured (PDF/docs) inputs.
You communicate concisely, insightfully, and visually, grounding every response in real uploaded data.
You never invent facts. You always explain how an insight was derived in plain English.
Give insights and information ONLY from the uploaded database(s).`;

const chatService = new ChatService(YOUR_API_KEY);
const plottingService = new PlottingService();

interface Message {
  role: string;
  content: string;
  image?: string;
  ts?: string;
  pending?: boolean; // flag for spinner bubble
}

type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
};

function currentUserEmail(): string | null {
  try {
    const raw = localStorage.getItem("ops_user");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return (u?.email || null) as string | null;
  } catch {
    return null;
  }
}

function sanitizeUserKey(input?: string | null) {
  if (!input) return "__anon";
  return String(input).trim().toLowerCase().replace(/[@\s+<>:"'\/\\]+/g, "_");
}

function sessionChatsKeyForUser(userKey: string) {
  return `session_user_chats_${userKey}`;
}

/** ===================== CSV helpers to build small context and full summary ===================== **/
function safeSplit(row: string) {
  let inQ = false;
  let buf = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') inQ = !inQ;
    if (ch === "," && inQ) buf += "§§COMMA§§";
    else buf += ch;
  }
  return buf
    .split(",")
    .map((s) => s.replace(/§§COMMA§§/g, ",").replace(/^"|"$/g, "").trim());
}

function parseCSVSample(csvText: string, maxRows = 8) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { header: [], rows: [] as string[][], raw: "" };
  const header = safeSplit(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < Math.min(lines.length, 1 + maxRows); i++) {
    rows.push(safeSplit(lines[i]));
  }
  return { header, rows, raw: lines.slice(0, 1 + maxRows).join("\n") };
}

// Compute simple numeric & categorical summaries across entire CSV (single pass)
function computeDatasetSummary(csvText: string, maxUniqueValues = 3) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: 0, header: [], summaryText: "" };

  const header = safeSplit(lines[0]);
  const cols = header.length;
  const stats: any = {};
  for (let c = 0; c < cols; c++) {
    stats[c] = { numericCount: 0, numericSum: 0, numericMin: Infinity, numericMax: -Infinity, samples: {} };
  }

  let rowCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = safeSplit(lines[i]);
    if (cells.length === 0) continue;
    rowCount++;
    for (let c = 0; c < cols; c++) {
      const val = (cells[c] ?? "").trim();
      if (val === "") {
        // treat as missing
        continue;
      }
      const n = Number(val.replace(/,/g, ""));
      if (!Number.isNaN(n) && isFinite(n)) {
        // numeric
        stats[c].numericCount++;
        stats[c].numericSum += n;
        if (n < stats[c].numericMin) stats[c].numericMin = n;
        if (n > stats[c].numericMax) stats[c].numericMax = n;
      } else {
        // categorical
        stats[c].samples[val] = (stats[c].samples[val] || 0) + 1;
      }
    }
  }

  // Build summary text
  const parts: string[] = [];
  parts.push(`Rows: ${rowCount}`);
  parts.push(`Columns: ${header.join(", ")}`);
  parts.push("");
  for (let c = 0; c < cols; c++) {
    const name = header[c];
    const s = stats[c];
    const numericCount = s.numericCount || 0;
    const numericSummary =
      numericCount > 0
        ? `numeric_count=${numericCount}, mean=${(s.numericSum / numericCount).toFixed(3)}, min=${s.numericMin}, max=${s.numericMax}`
        : null;

    const sampleObj = s.samples || {};
    const sampleEntries = Object.entries(sampleObj)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, maxUniqueValues)
      .map(([v, cnt]) => `${v} (${cnt})`);
    const sampleText = sampleEntries.length ? `top_values: ${sampleEntries.join(", ")}` : null;

    const summaryLine = [`Column: ${name}`, numericSummary, sampleText].filter(Boolean).join(" • ");
    parts.push(summaryLine);
  }

  return { rows: rowCount, header, summaryText: parts.join("\n") };
}

/** ===================== Main ChatPage Component ===================== **/
export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // dataset related state
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [datasetCsvSample, setDatasetCsvSample] = useState<string | null>(null);
  const [datasetCsvFull, setDatasetCsvFull] = useState<string | null>(null);
  const [datasetSummaryText, setDatasetSummaryText] = useState<string | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);

  const userEmail = currentUserEmail();
  const userKey = sanitizeUserKey(userEmail);
  const sessionKey = sessionChatsKeyForUser(userKey);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** ---------- load session threads ---------- */
  useEffect(() => {
    const raw = sessionStorage.getItem(sessionKey);
    let list: ChatThread[] = [];
    try {
      list = raw ? JSON.parse(raw) : [];
    } catch {
      list = [];
    }

    if (list.length === 0) {
      const id = `session_${Date.now()}`;
      const createdAt = new Date().toISOString();
      const newThread: ChatThread = { id, title: "New chat", createdAt, messages: [] };
      list = [newThread];
      sessionStorage.setItem(sessionKey, JSON.stringify(list));
    }

    setThreads(list);
    setSelectedThreadId(list[0].id);
    setMessages(list[0].messages || []);
  }, [sessionKey]);

  useEffect(() => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 80);
  }, [messages, isLoading]);

  function persistThreads(newThreads: ChatThread[]) {
    sessionStorage.setItem(sessionKey, JSON.stringify(newThreads));
  }

  function updateMessages(nextMessages: Message[]) {
    const id = selectedThreadId;
    const updated = threads.map((t) => (t.id === id ? { ...t, messages: nextMessages } : t));
    setThreads(updated);
    persistThreads(updated);
    setMessages(nextMessages);
  }

  /** ---------- dataset loading (full CSV & sample & summary) ---------- */
  useEffect(() => {
    async function loadDatasets() {
      try {
        const base = "";
        const res = await fetch(`${base}/api/datasets`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list: any[] = Array.isArray(json.datasets) ? json.datasets : Array.isArray(json) ? json : [];
        const normalized = list
          .map((d: any) => ({
            id: d.dataset_id ?? d.id ?? "",
            filename: d.filename ?? d.file_name ?? "",
            rows: d.rows ?? d.count ?? null,
            created_at: d.created_at ?? d.created ?? null,
          }))
          .filter((d) => d.id);
        setDatasets(normalized);

        // Try per-user owned datasets list stored by upload page
        const ownedKey = `user_datasets_${userKey}`;
        const rawOwned = localStorage.getItem(ownedKey);
        const owned: string[] = rawOwned ? JSON.parse(rawOwned) : [];
        if (Array.isArray(owned) && owned.length > 0) {
          const pickId = owned[0] || normalized[0]?.id;
          if (pickId) await loadDatasetFully(pickId);
        } else if (normalized.length > 0) {
          await loadDatasetFully(normalized[0].id);
        }
      } catch (err) {
        console.warn("Could not fetch datasets list:", err);
      }
    }
    loadDatasets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  async function loadDatasetFully(datasetId: string | null) {
    if (!datasetId) {
      setSelectedDatasetId(null);
      setDatasetCsvSample(null);
      setDatasetCsvFull(null);
      setDatasetSummaryText(null);
      return;
    }
    setDatasetLoading(true);
    try {
      const res = await fetch(`/api/download/${datasetId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // sample
      const parsed = parseCSVSample(text, 8);
      setDatasetCsvSample(parsed.raw || null);
      setDatasetCsvFull(text || null);

      // compute summary from full CSV (single pass)
      const summ = computeDatasetSummary(text);
      setDatasetSummaryText(summ.summaryText || null);

      setSelectedDatasetId(datasetId);
    } catch (err) {
      console.warn("Failed to load dataset fully:", err);
      setSelectedDatasetId(null);
      setDatasetCsvSample(null);
      setDatasetCsvFull(null);
      setDatasetSummaryText(null);
    } finally {
      setDatasetLoading(false);
    }
  }

  /** ---------- send/receive with dataset-aware system prompt and pending assistant bubble ---------- */
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input, ts: new Date().toISOString() };
    const optimistic = [...messages, userMessage];

    // create and append a pending assistant bubble (spinner)
    const pendingAssistant: Message = { role: "assistant", content: "", pending: true, ts: new Date().toISOString() };
    const optimisticWithPending = [...optimistic, pendingAssistant];

    setMessages(optimisticWithPending);
    updateMessages(optimisticWithPending);

    const userInput = input;
    setInput("");
    setIsLoading(true);

    const isPlot = plottingService.detectPlotRequest(userInput);

    // Build messages for the API. Include dataset summary (from full CSV) if available.
    const baseMessagesForApi: { role: string; content: string }[] = optimistic.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add system prompt
    const systemMessage = SYSTEM_PROMPT + 
      (datasetSummaryText 
        ? "\n\nYou have access to a dataset. Use the dataset summary below to answer questions accurately. " +
          "Prefer dataset-derived values over hallucination. If a question cannot be answered from the data, say so.\n\n" +
          datasetSummaryText
        : datasetCsvSample
        ? "\n\nYou have access to a dataset sample. Use the sample to help answer questions and prefer dataset content when possible. Sample below:\n\n" +
          datasetCsvSample
        : "");

    baseMessagesForApi.unshift({
      role: "system",
      content: systemMessage,
    });

    try {
      if (isPlot) {
        // ask model to produce python plotting code that assumes 'df' exists.
        const enhanced = [
          ...baseMessagesForApi,
          {
            role: "system",
            content:
              "When producing plotting code, respond with a Python code block using matplotlib/seaborn/pandas. Use `plt.savefig('output.png', bbox_inches='tight')` at the end and do NOT call `plt.show()`. If possible, use the DataFrame name `df` to refer to the dataset. If the dataset is not loaded, assume a pandas df can be created from the provided CSV.",
          },
        ];

        const response = await chatService.chat(enhanced, MODEL);

        if (response.success) {
          const plotCode = plottingService.extractPlotCode(response.message);
          if (plotCode) {
            const plotResult = await plottingService.generatePlot(plotCode, datasetCsvFull ?? datasetCsvSample ?? undefined);

            // replace pending assistant bubble with final assistant message (with image if available)
            const finalAssistant: Message = {
              role: "assistant",
              content: response.message,
              image: plotResult.success ? plotResult.image : undefined,
              ts: new Date().toISOString(),
            };
            const replaced = [...optimistic, finalAssistant];
            setMessages(replaced);
            updateMessages(replaced);
          } else {
            // no plot code found: replace pending with message text
            const finalAssistant: Message = { role: "assistant", content: response.message, ts: new Date().toISOString() };
            const replaced = [...optimistic, finalAssistant];
            setMessages(replaced);
            updateMessages(replaced);
          }
        } else {
          const finalAssistant: Message = { role: "assistant", content: `❌ ${response.error}`, ts: new Date().toISOString() };
          const replaced = [...optimistic, finalAssistant];
          setMessages(replaced);
          updateMessages(replaced);
        }
      } else {
        // Normal chat: send baseMessagesForApi
        const response = await chatService.chat(baseMessagesForApi, MODEL);
        const assistantContent = response.success ? response.message : `❌ ${response.error}`;
        const finalAssistant: Message = { role: "assistant", content: assistantContent, ts: new Date().toISOString() };
        const final = [...optimistic, finalAssistant];
        setMessages(final);
        updateMessages(final);
      }
    } catch (err) {
      const finalAssistant: Message = { role: "assistant", content: `❌ ${String(err)}`, ts: new Date().toISOString() };
      const final = [...optimistic, finalAssistant];
      setMessages(final);
      updateMessages(final);
    } finally {
      setIsLoading(false);
    }
  };

  /** ---------- thread management (unchanged behavior) ---------- */
  function createNewChat() {
    const id = `session_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const defaultTitle = `Chat ${new Date().toLocaleString()}`;
    const name = window.prompt("Enter chat name:", defaultTitle);
    const title = name && name.trim() ? name.trim() : "New chat";
    const newThread: ChatThread = { id, title, createdAt, messages: [] };
    const updated = [newThread, ...threads];
    setThreads(updated);
    persistThreads(updated);
    setSelectedThreadId(id);
    setMessages([]);
  }

  function deleteThread(threadId: string) {
    if (!window.confirm("Delete this chat? This cannot be undone for the current session.")) return;
    const updated = threads.filter((t) => t.id !== threadId);
    setThreads(updated);
    persistThreads(updated);
    if (selectedThreadId === threadId) {
      if (updated.length > 0) {
        setSelectedThreadId(updated[0].id);
        setMessages(updated[0].messages || []);
      } else {
        const id = `session_${Date.now()}`;
        const createdAt = new Date().toISOString();
        const newThread: ChatThread = { id, title: "New chat", createdAt, messages: [] };
        const list = [newThread];
        setThreads(list);
        persistThreads(list);
        setSelectedThreadId(id);
        setMessages([]);
      }
    }
  }

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", background: "#0b1220", overflow: "hidden" }}>
      {/* Sidebar */}
      <div
        style={{
          width: 300,
          borderRight: "1px solid rgba(255,255,255,0.03)",
          background: "rgba(255,255,255,0.02)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ fontWeight: 800, color: "white", fontSize: 16, marginBottom: 10 }}>Chats</div>

        {/* Inline style block to ensure select + option match app theme */}
        <style>{`
          /* dropdown background + options to match app theme */
          select.chat-dataset-select {
            background: rgba(255,255,255,0.02) !important;
            color: var(--text, #e6eef8) !important;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
          }
          /* styling option background color (works in most browsers) */
          select.chat-dataset-select option {
            background: #0b1220 !important;
            color: #e6eef8 !important;
          }
          /* hovered option color (some browsers use :hover on option) */
          select.chat-dataset-select option:hover {
            background: rgba(34,211,238,0.12) !important;
            color: #e6eef8 !important;
          }
        `}</style>

        {/* Dataset selector (compact, doesn't alter layout) */}
        <div style={{ marginBottom: 10 }}>
          <select
            className="chat-dataset-select"
            value={selectedDatasetId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              (async () => {
                if (id) await loadDatasetFully(id);
                else {
                  setSelectedDatasetId(null);
                  setDatasetCsvSample(null);
                  setDatasetCsvFull(null);
                  setDatasetSummaryText(null);
                }
              })();
            }}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
              color: "var(--text, #e6eef8)",
            }}
            title="Select dataset for queries"
          >
            <option value="">Use no dataset</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename || d.id}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={createNewChat}
          style={{
            padding: "8px 12px",
            background: "#22d3ee",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            color: "#0b1220",
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          New
        </button>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                setSelectedThreadId(t.id);
                setMessages(t.messages);
              }}
              style={{
                padding: "10px",
                borderRadius: 10,
                marginBottom: 8,
                background: selectedThreadId === t.id ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteThread(t.id);
                }}
                title="Delete chat"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  padding: 4,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "40px 80px 140px 80px",
            boxSizing: "border-box",
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                marginTop: "25vh",
                color: "#cbd5e1",
                fontSize: 18,
              }}
            >
              <strong>OpsCoPilot</strong> — Your intelligent operations assistant.
              {datasetSummaryText && (
                <div style={{ marginTop: 16, fontSize: 13, color: "#94a3b8", whiteSpace: "pre-wrap", display: "inline-block" }}>
                  {datasetLoading ? "Loading dataset…" : `Dataset summary:\n${datasetSummaryText}`}
                </div>
              )}
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    background: m.role === "user" ? "linear-gradient(90deg, #0ea5e9, #0369a1)" : "rgba(255,255,255,0.05)",
                    color: m.role === "user" ? "#f8fafc" : "#e2e8f0",
                    padding: "10px 14px",
                    borderRadius: 14,
                    lineHeight: 1.5,
                    fontSize: 15,
                    fontWeight: 400,
                    boxShadow:
                      m.role === "user" ? "0 2px 10px rgba(14,165,233,0.25)" : "0 2px 10px rgba(255,255,255,0.05)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxWidth: "70%",
                    width: "fit-content",
                    position: "relative",
                  }}
                >
                  {/* If this assistant message is pending, show spinner inside the bubble */}
                  {m.pending ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        aria-hidden
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          border: "2px solid rgba(255,255,255,0.15)",
                          borderTopColor: "rgba(255,255,255,0.85)",
                          animation: "cp-spin 1s linear infinite",
                        }}
                      />
                      <span style={{ color: "#cbd5e1" }}>Thinking…</span>
                      {/* small keyframe style injected inline */}
                      <style>{`@keyframes cp-spin { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }`}</style>
                    </div>
                  ) : (
                    <>
                      <span>{m.content}</span>
                      {m.image && (
                        <img
                          src={`data:image/png;base64,${m.image}`}
                          alt="Generated plot"
                          style={{ marginTop: 10, borderRadius: 8, maxWidth: "100%" }}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat Input */}
        <div
          style={{
            position: "sticky",
            bottom: 40,
            width: "100%",
            background: "rgba(10,15,25,0.95)",
            padding: "14px 24px",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask OpsCoPilot something..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            style={{
              flex: 1,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              padding: "14px 16px",
              color: "white",
              outline: "none",
              fontSize: 15,
            }}
          />
          <button
            onClick={handleSend}
            style={{
              background: "#22d3ee",
              color: "#0b1220",
              border: "none",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}