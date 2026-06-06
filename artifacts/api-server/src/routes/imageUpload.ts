import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import { imageUploadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

// ── Storage setup ─────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported format: ${file.mimetype}`));
    }
  },
});

// ── AI extraction ─────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Read this handwritten Bengali factory ledger page (taal misri / palm sugar factory, Bangladesh).

LEFT column = আয় (income/credit). RIGHT column = খরচ (expense/debit).
Amounts written as NUMBER/= mean Bangladeshi Taka. Bengali numerals: ০=0 ১=1 ২=2 ৩=3 ৪=4 ৫=5 ৬=6 ৭=7 ৮=8 ৯=9.
Red circles = verified correct entries. Strikethrough = skip.

Return ONLY this JSON (no markdown, no extra text):
{"rows":[{"date":"YYYY-MM-DD or null","particulars":"person name or item description","quantity":null,"unit":null,"rate":null,"debit":null,"credit":null,"confidence":"high|medium|low","raw_text":"original text"}],"page_summary":{"detected_language":"bn","total_debit":0,"total_credit":0,"notes":"page info"}}

Rules:
- quantity = number of items/workers/kg/tins (numeric, not null if visible)
- unit = measurement unit: জন (person), কেজি (kg), মণ (maund), টিন (tin), লিটার, etc.
- rate = price per unit in Taka (numeric, not null if visible)
- debit/credit = total amount (quantity × rate if shown, or direct amount)
- For wage line "বলরাম ঘোষ ২০ জন × ১৪১/=" → particulars="বলরাম ঘোষ", quantity=20, unit="জন", rate=141, debit=2820
- For sale "৫০০ টিন তাল মিসরি × ৮০/=" → particulars="তাল মিসরি", quantity=500, unit="টিন", rate=80, credit=40000
- For purchase "৩০ মণ আখ × ১২০/=" → particulars="আখ", quantity=30, unit="মণ", rate=120, debit=3600
- Include sub-totals as rows with particulars "মোট" or "সর্বমোট", quantity/unit/rate null.`;

function parseAIJson(text: string): { rows: unknown[]; page_summary: unknown } | null {
  const candidates = [
    // direct
    text.trim(),
    // strip single markdown fence
    text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim(),
    // extract first {...} block containing "rows"
    (() => { const m = text.match(/\{[\s\S]*?"rows"[\s\S]*?\}/); return m?.[0] ?? null; })(),
    // extract from first { to last }
    (() => {
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      return s >= 0 && e > s ? text.slice(s, e + 1) : null;
    })(),
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const parsed = JSON.parse(c) as { rows: unknown[]; page_summary: unknown };
      if (Array.isArray(parsed.rows)) return parsed;
    } catch { /* try next */ }
  }
  return null;
}

async function geminiCall(apiKey: string, parts: unknown[], maxTokens = 8192): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
      }),
    },
  );
  if (!res.ok) { const b = await res.text(); throw new Error(`Gemini ${res.status}: ${b}`); }
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function extractWithGemini(
  storagePath: string,
  mimeType: string,
): Promise<{ rows: unknown[]; page_summary: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const imageBuffer = fs.readFileSync(storagePath);
  const base64 = imageBuffer.toString("base64");
  const imgMime = (["image/jpeg", "image/png", "image/webp", "image/gif"] as string[]).includes(mimeType)
    ? mimeType : "image/jpeg";

  // ── Step 1: transcribe the image to plain text ────────────────────────────
  const transcribePrompt = `This is a handwritten Bengali factory ledger page from a taal misri (palm sugar) factory in Narayanganj, Bangladesh.

THE PAGE HAS TWO SIDES:
- LEFT side = জমা (INCOME): sales of taal misri (palm sugar), money received from customers
  Typical LEFT entries look like: "৪৯০ টিন × ১৪৭/= = ৭২০৩০" or "বিক্রয় ৫০০ টিন"
- RIGHT side = খরচ (EXPENSE): worker wages, raw material purchases
  Typical RIGHT entries look like: "বলরাম ঘোষ ২০ জন × ১৪১/=" or "৩০ মণ আখ × ১২০/="

WHAT TO LOOK FOR:
- Worker names (Bengali names like বলরাম, বিমল, শ্রীদাম, রাজলক্ষ্মী, সুশীল, আশুতোষ etc.) + জন (number of workers) + rate
- আখ (sugarcane) purchases with মণ (maund) quantity and rate
- কাঠ (wood) or জ্বালানি (fuel) purchases
- তাল মিসরি টিন (tins of palm sugar) sales with quantity and price
- Sub-totals marked as মোট or সর্বমোট
- Red circled ⭕ amounts = verified correct

TRANSCRIPTION RULES:
- Convert Bengali numerals: ০=0 ১=1 ২=2 ৩=3 ৪=4 ৫=5 ৬=6 ৭=7 ৮=8 ৯=9
- Amounts written as NUMBER/= mean Bangladeshi Taka — write as just NUMBER
- Clearly mark which side: start LEFT entries with "জমা:" and RIGHT entries with "খরচ:"
- Note page number and date if visible at top
- Mark red-circled items with ⭕
- Write one entry per line
- Do NOT format as JSON`;

  const transcription = await geminiCall(
    apiKey,
    [{ inline_data: { mime_type: imgMime, data: base64 } }, { text: transcribePrompt }],
    4096,
  );

  if (!transcription.trim()) throw new Error("Gemini could not read any text from the image");

  // ── Step 2: convert transcription to structured JSON ─────────────────────
  const structurePrompt = `Convert this Bengali factory ledger transcription into structured JSON.

CONFIRMED COLUMN RULES:
- Lines marked "জমা:" = INCOME → put amount in "credit" field
- Lines marked "খরচ:" = EXPENSE → put amount in "debit" field

TRANSCRIPTION:
"""
${transcription}
"""

CONVERSION RULES:
- Worker wages: "বলরাম ঘোষ ২০ জন × ১৪১" → {particulars:"বলরাম ঘোষ", quantity:20, unit:"জন", rate:141, debit:2820, credit:null}
- Taal misri sale: "৪৯০ টিন × ১৪৭" → {particulars:"তাল মিসরি বিক্রয়", quantity:490, unit:"টিন", rate:147, debit:null, credit:72030}
- Sugarcane buy: "৩০ মণ আখ × ১২০" → {particulars:"আখ কেনা", quantity:30, unit:"মণ", rate:120, debit:3600, credit:null}
- Wood/fuel buy: "কাঠ ৫০ মণ × ৮০" → {particulars:"কাঠ কেনা", quantity:50, unit:"মণ", rate:80, debit:4000, credit:null}
- Sub-totals "মোট": quantity/unit/rate=null, put total in appropriate debit or credit
- If total shown directly (no calculation): still extract as-is
- confidence: "high"=amount clear, "medium"=partially readable, "low"=guessed
- date: YYYY-MM-DD if visible at top of page, else null for all rows

Return ONLY valid JSON, no markdown, no explanation:
{"rows":[{"date":null,"particulars":"","quantity":null,"unit":null,"rate":null,"debit":null,"credit":null,"confidence":"high","raw_text":""}],"page_summary":{"detected_language":"bn","total_debit":0,"total_credit":0,"notes":"page number and date info here"}}`;


  const jsonText = await geminiCall(apiKey, [{ text: structurePrompt }], 8192);
  const result = parseAIJson(jsonText);
  if (result) return result;

  // Step 2 failed — return transcription in notes so user can see what was read
  console.error("Step 2 JSON parse failed. Transcription was:\n%s", transcription.slice(0, 800));
  return {
    rows: [],
    page_summary: {
      detected_language: "bn", total_debit: 0, total_credit: 0,
      notes: `AI transcription (ম্যানুয়ালি যোগ করুন):\n${transcription}`,
    },
  };
}

async function extractWithAnthropic(
  storagePath: string,
  mimeType: string,
): Promise<{ rows: unknown[]; page_summary: unknown }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });
  const imageBuffer = fs.readFileSync(storagePath);
  const base64 = imageBuffer.toString("base64");
  const supportedType = (["image/jpeg", "image/png", "image/gif", "image/webp"] as string[]).includes(mimeType)
    ? (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
    : "image/jpeg";

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: supportedType, data: base64 } },
        { type: "text", text: EXTRACTION_PROMPT },
      ]}],
    });
    const text = response.content.find((c) => c.type === "text")?.text ?? "";
    const result = parseAIJson(text);
    if (result) return result;
    if (attempt === 1) throw new Error("Anthropic returned invalid JSON after 2 attempts");
  }
  throw new Error("Extraction failed");
}

async function extractFromImage(
  storagePath: string,
  mimeType: string,
): Promise<{ rows: unknown[]; page_summary: unknown }> {
  if (process.env.GEMINI_API_KEY) return extractWithGemini(storagePath, mimeType);
  if (process.env.ANTHROPIC_API_KEY) return extractWithAnthropic(storagePath, mimeType);
  throw new Error("কোনো AI API key সেট করা নেই। GEMINI_API_KEY বা ANTHROPIC_API_KEY সেট করুন।");
}

// Trigger extraction asynchronously after upload
function triggerExtraction(id: number, storagePath: string, mimeType: string) {
  (async () => {
    try {
      await db
        .update(imageUploadsTable)
        .set({ status: "processing" })
        .where(eq(imageUploadsTable.id, id));

      const result = await extractFromImage(storagePath, mimeType);

      await db
        .update(imageUploadsTable)
        .set({
          status: "ready",
          extractedRowsJson: JSON.stringify(result.rows),
          pageSummaryJson: JSON.stringify(result.page_summary),
        })
        .where(eq(imageUploadsTable.id, id));
    } catch (err) {
      await db
        .update(imageUploadsTable)
        .set({
          status: "failed",
          failureReason: err instanceof Error ? err.message : String(err),
        })
        .where(eq(imageUploadsTable.id, id));
    }
  })();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/image-upload  — accept one image
router.post("/", upload.single("image"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No image file provided" });

  const [row] = await db
    .insert(imageUploadsTable)
    .values({
      originalFilename: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      status: "queued",
    })
    .returning();

  // Fire-and-forget extraction
  triggerExtraction(row.id, row.storagePath, row.mimeType);

  return res.status(201).json({
    id: row.id,
    originalFilename: row.originalFilename,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
});

// GET /api/image-upload  — list all
router.get("/", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(imageUploadsTable)
    .orderBy(imageUploadsTable.createdAt);

  res.json(
    rows.map((r) => ({
      id: r.id,
      originalFilename: r.originalFilename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      status: r.status,
      failureReason: r.failureReason,
      committedAt: r.committedAt?.toISOString() ?? null,
      committedEntryIds: r.committedEntryIds ? JSON.parse(r.committedEntryIds) : null,
      pageSummary: r.pageSummaryJson ? JSON.parse(r.pageSummaryJson) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// GET /api/image-upload/:id  — get one with extracted rows
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select()
    .from(imageUploadsTable)
    .where(eq(imageUploadsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  return res.json({
    id: row.id,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    failureReason: row.failureReason,
    extractedRows: row.extractedRowsJson ? JSON.parse(row.extractedRowsJson) : [],
    pageSummary: row.pageSummaryJson ? JSON.parse(row.pageSummaryJson) : null,
    committedAt: row.committedAt?.toISOString() ?? null,
    committedEntryIds: row.committedEntryIds ? JSON.parse(row.committedEntryIds) : null,
    createdAt: row.createdAt.toISOString(),
  });
});

// GET /api/image-upload/:id/image  — serve the actual image file
router.get("/:id/image", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({ storagePath: imageUploadsTable.storagePath, mimeType: imageUploadsTable.mimeType })
    .from(imageUploadsTable)
    .where(eq(imageUploadsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });
  if (!fs.existsSync(row.storagePath)) return res.status(404).json({ error: "File not found on disk" });

  res.setHeader("Content-Type", row.mimeType);
  return res.sendFile(path.resolve(row.storagePath));
});

// PATCH /api/image-upload/:id/rows  — save user-edited extracted rows
router.patch("/:id/rows", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { rows } = req.body as { rows: unknown[] };
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array" });

  await db
    .update(imageUploadsTable)
    .set({ extractedRowsJson: JSON.stringify(rows) })
    .where(eq(imageUploadsTable.id, id));

  return res.json({ success: true });
});

// POST /api/image-upload/:id/commit  — create cash entries (idempotent)
router.post("/:id/commit", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select()
    .from(imageUploadsTable)
    .where(eq(imageUploadsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  // Idempotency: already committed
  if (row.committedAt) {
    return res.json({
      success: true,
      alreadyCommitted: true,
      committedEntryIds: row.committedEntryIds ? JSON.parse(row.committedEntryIds) : [],
    });
  }

  const { rows } = req.body as {
    rows: Array<{
      date: string;
      particulars: string;
      category: string;
      debit: number | null;
      credit: number | null;
    }>;
  };
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows array is required" });
  }

  const { cashEntriesTable } = await import("@workspace/db");

  const createdIds: number[] = [];
  for (const r of rows) {
    const isIncome = (r.credit ?? 0) > 0;
    const amount = isIncome ? (r.credit ?? 0) : (r.debit ?? 0);
    if (!r.date || !r.category || amount <= 0) continue;

    const [entry] = await db
      .insert(cashEntriesTable)
      .values({
        date: r.date,
        amount: String(amount),
        type: isIncome ? "income" : "expense",
        category: r.category,
        note: `${r.particulars}${r.particulars ? " · " : ""}ছবি থেকে আমদানি #${id}`,
      })
      .returning({ id: cashEntriesTable.id });

    if (entry) createdIds.push(entry.id);
  }

  await db
    .update(imageUploadsTable)
    .set({
      committedAt: new Date(),
      committedEntryIds: JSON.stringify(createdIds),
    })
    .where(eq(imageUploadsTable.id, id));

  return res.json({ success: true, committedEntryIds: createdIds });
});

// DELETE /api/image-upload/:id  — delete image + DB row
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [row] = await db
    .select({ storagePath: imageUploadsTable.storagePath })
    .from(imageUploadsTable)
    .where(eq(imageUploadsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  try { fs.unlinkSync(row.storagePath); } catch { /* already gone */ }
  await db.delete(imageUploadsTable).where(eq(imageUploadsTable.id, id));

  return res.json({ success: true });
});

export default router;