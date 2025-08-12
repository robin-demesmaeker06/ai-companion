import fetch from "node-fetch";
import Database from "better-sqlite3";
const db = new Database("./db/memory.db");

function getAllMemory() {
  return db.prepare("SELECT * FROM memory ORDER BY updated_at ASC").all();
}

async function summarizeMemory() {
  const items = getAllMemory();
  if (items.length < 100) return;
  const concat = items.map(i => `${i.key}: ${i.value}`).join("\n");
  const prompt = `Summarize the following memory items into a short paragraph (<=100 words) and list 5 concise facts we should keep:\n\n${concat}\n\nReturn JSON: {"summary":"...","facts":["f1","f2"]}`;
  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama3.1", prompt, max_tokens: 400 })
  });
  const j = await resp.json();
  const text = j?.choices?.[0]?.content?.text || j.output || JSON.stringify(j);
  // extract JSON part
  const b = text.indexOf("{");
  const e = text.lastIndexOf("}") + 1;
  if (b >= 0 && e > b) {
    const parsed = JSON.parse(text.slice(b, e));
    // remove old memory and store summary
    db.prepare("DELETE FROM memory").run();
    db.prepare("INSERT INTO memory(key, value) VALUES(?, ?)").run("memory_summary", parsed.summary);
    for (const f of parsed.facts || []) {
      db.prepare("INSERT INTO memory(key, value) VALUES(?, ?)").run("memory_fact", f);
    }
    console.log("Memory summarized and compacted.");
  } else {
    console.warn("Could not parse summary from LLM.");
  }
}

// run once when executed
summarizeMemory().catch(console.error);
