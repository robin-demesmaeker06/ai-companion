// server/index.js
import express from "express";
import fetch from "node-fetch";
import multer from "multer";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json({ limit: "20mb" }));

const upload = multer({ dest: "../uploads/" });
const dbPath = path.join(process.cwd(), "db", "memory.db");
if (!fs.existsSync(path.join(process.cwd(), "db"))) fs.mkdirSync(path.join(process.cwd(), "db"));
const db = new Database(dbPath);

// create memory table
db.exec(`CREATE TABLE IF NOT EXISTS memory(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, value TEXT, importance INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

// Memory helpers
function addMemory(key, value) {
  const stmt = db.prepare("INSERT INTO memory(key, value) VALUES(?, ?)");
  return stmt.run(key, value);
}
function getMemory(limit = 10) {
  const stmt = db.prepare("SELECT * FROM memory ORDER BY updated_at DESC LIMIT ?");
  return stmt.all(limit);
}

// STT: accepts audio multipart/form-data -> proxies to stt_service
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  try {
    const filePath = req.file.path;
    // Read file and post to STT microservice
    const fileStream = fs.createReadStream(filePath);
    const sttResp = await fetch("http://localhost:5200/stt", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: fileStream
    });
    const sttJson = await sttResp.json();
    fs.unlinkSync(filePath);
    res.json(sttJson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Chat: takes user text and optional personalityOverride; calls Ollama
app.post("/api/chat", async (req, res) => {
  try {
    const { userText, personalityOverride } = req.body;
    const systemPrompt = personalityOverride || `You are Kuro, a warm witty anime companion. Return JSON: {\n  \"text\": string, \n  \"emotion\": string, \n  \"memory_add\": [string]\n}`;
    // Compose prompt with recent memory
    const memoryItems = getMemory(10).map(m => `${m.key}: ${m.value}`).join("\n");
    const prompt = `${systemPrompt}\n\nMEMORY:\n${memoryItems}\n\nUser: ${userText}\nAssistant:`;

    // Call Ollama generate endpoint (assumes Ollama running locally)
    const ollamaResp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",
        prompt,
        max_tokens: 200,
        stream: false
      })
    });
    const ollamaJson = await ollamaResp.json();

    // Ollama response parsing: attempt to parse structured JSON from text
    let assistantText = "";
    try {
      // Ollama returns an object like {"id":..., "choices":[{"content":{"type":"output_text","text":"..."}}]}
      const text = ollamaJson?.choices?.[0]?.content?.text || ollamaJson?.output || JSON.stringify(ollamaJson);
      // We expect the model to return JSON. Try to find a JSON block inside the text.
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      const jsonStr = firstBrace >= 0 && lastBrace >= 0 ? text.slice(firstBrace, lastBrace + 1) : null;
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        assistantText = parsed.text || "";
        // save memory if any
        if (Array.isArray(parsed.memory_add)) {
          for (const item of parsed.memory_add) addMemory("note", item);
        }
        return res.json(parsed);
      }
      // fallback: return raw text as assistant text
      return res.json({ text, emotion: "neutral", memory_add: [] });
    } catch (err) {
      console.error("Error parsing Ollama output:", err);
      return res.json({ text: JSON.stringify(ollamaJson), emotion: "neutral", memory_add: [] });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// TTS: text -> calls local tts_service which must return audioBase64 and visemes
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice_sample_path, speed } = req.body;
    const ttsResp = await fetch("http://localhost:5300/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_sample_path, speed })
    });
    const ttsJson = await ttsResp.json();
    res.json(ttsJson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// Memory endpoints
app.get("/api/memory", (req, res) => {
  res.json(getMemory(50));
});
app.post("/api/memory", (req, res) => {
  const { key, value } = req.body;
  addMemory(key, value);
  res.json({ ok: true });
});

app.listen(4000, () => console.log("Server listening on http://localhost:4000"));