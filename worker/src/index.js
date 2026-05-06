// Medivoyage AI demo worker.
// POST /api/intake — accepts text or structured input, returns AI-drafted treatment plan + cost comparison.
// Locked to the single-tooth implant + crown procedure for v1.

import { computeCosts, RATE_CARD } from "./rate-card.js";

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";  // Vision-capable.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1500;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5MB cap on base64 payload before decode.

// ----------------- CORS -----------------
function corsHeaders(origin, allowedList) {
  const allowed = (allowedList || "").split(",").map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function jsonResponse(body, init, cors) {
  return new Response(JSON.stringify(body), {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(cors || {}),
      ...((init && init.headers) || {})
    }
  });
}

// ----------------- Prompt builder -----------------
const SYSTEM_BASE = `
You are the AI care coordinator for Medivoyage Health, a vertical AI agent for cross-border dental care.

Your role: draft a PRE-SCREENING BRIEFING for partner dentist Dr. Noel Rivas, DDS. The briefing summarizes the case and flags clinical considerations. Dr. Rivas reviews, edits, and approves your briefing before any plan reaches the patient. You are the pre-screener; the dentist is the diagnostician.

Your scope in this prototype is locked to ONE procedure: a single-tooth dental implant + crown. If the case is clearly NOT a single missing tooth (e.g. multiple missing teeth requiring full-arch, root canal only, cleaning, complex periodontal disease, orthodontics, or anything else), set in_scope=false and explain briefly so the dentist can route the case appropriately.

Hard rules:
- You DO NOT generate prices. Cost numbers come from a deterministic rate card.
- You DO NOT diagnose. You flag observations and questions for the dentist.
- You DO NOT make claims of medical certainty. Use language like "appears to", "likely", "would benefit from clinical confirmation".

Return STRICT JSON matching this schema. No markdown, no commentary, no fences. Just the JSON object.

{
  "in_scope": boolean,
  "out_of_scope_reason": string | null,
  "findings": {
    "summary": string,
    "missing_teeth_described": string,
    "tooth_number_guess": number | null,
    "complications_likely": string[]
  },
  "treatment_plan": {
    "primary_procedure": "Single-tooth dental implant + crown",
    "may_need_bone_graft": boolean,
    "bone_graft_reasoning": string,
    "estimated_total_days_in_mexico": string,
    "estimated_timeline_total_months": string
  },
  "narrative": string,
  "questions_for_dentist": string[]
}

Constraints on each field:
- findings.summary: one sentence, plain English. Frame as observation, not diagnosis.
- findings.missing_teeth_described: location in plain English (e.g. "lower-left first molar"). For x-ray analysis, describe only what you actually see.
- findings.tooth_number_guess: Universal Tooth Numbering System (1-32), null if unclear.
- findings.complications_likely: short flags like "bone loss likely (missing > 12 months)", "smoker — slower osseointegration", "diabetes — clearance from PCP needed", "existing root canal on adjacent tooth", "visible decay on adjacent tooth".
- treatment_plan.may_need_bone_graft: true if missing for >12 months OR upper molar OR significant bone loss signals visible. Always preliminary — dentist confirms via CBCT.
- treatment_plan.bone_graft_reasoning: one sentence why or why not.
- narrative: 2-3 sentences. Address the patient directly but explicitly mention that Dr. Rivas will review and confirm. Calm, direct, no hype.
- questions_for_dentist: things the dentist should clarify on review. Be specific.

Output ONLY the JSON object. No prose before or after.
`.trim();

const SYSTEM_XRAY_ADDITION = `

X-RAY ANALYSIS MODE
You are being shown a panoramic dental radiograph. Read it carefully and identify:
1. Whether there is exactly ONE missing tooth (suitable for our scope) or MULTIPLE missing teeth / full-arch issues (out of scope).
2. The location of any missing tooth using anatomical description ("lower-left first molar") and Universal Tooth Numbering (1-32).
3. Visible bone resorption near any extraction site (suggests bone graft may be needed).
4. Visible existing restorations, root canals, or pathology on adjacent teeth (relevant to implant planning).

If you are uncertain about what the x-ray shows, set in_scope=false and explain in out_of_scope_reason that the image quality, angle, or complexity requires partner-dentist review. NEVER invent findings.

Be honest if the x-ray shows a healthy mouth with no missing teeth — set in_scope=false and explain in narrative that no implant is currently indicated based on the radiograph.
`.trim();

function buildPrompt(input) {
  let userContent;  // Either a string or an array of content blocks.

  if (input.mode === "text") {
    userContent = `PATIENT DESCRIPTION:\n${input.description}\n\nDraft the JSON output as specified.`;
  } else if (input.mode === "structured") {
    const s = input.structured || {};
    const lines = [];
    if (s.tooth_position) lines.push(`Missing tooth position: ${s.tooth_position}`);
    if (s.tooth_number)   lines.push(`Tooth number (Universal): ${s.tooth_number}`);
    if (s.missing_duration_months != null) lines.push(`Missing for: ${s.missing_duration_months} months`);
    if (s.age != null) lines.push(`Patient age: ${s.age}`);
    if (s.has_pain != null) lines.push(`Currently painful: ${s.has_pain ? "yes" : "no"}`);
    if (s.smoker != null) lines.push(`Smoker: ${s.smoker ? "yes" : "no"}`);
    if (s.diabetes != null) lines.push(`Diabetes: ${s.diabetes ? "yes" : "no"}`);
    if (s.general_dental_health) lines.push(`Self-reported dental health: ${s.general_dental_health}`);
    if (s.notes) lines.push(`Additional notes: ${s.notes}`);

    userContent = `STRUCTURED INTAKE:\n${lines.join("\n")}\n\nDraft the JSON output as specified.`;
  } else if (input.mode === "xray") {
    // Image content block + text.
    const ctx = (input.context || "").trim();
    const ctxLine = ctx ? `\n\nADDITIONAL CONTEXT FROM PATIENT:\n${ctx}` : "";
    userContent = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: input.image_media_type,
          data: input.image_base64
        }
      },
      {
        type: "text",
        text: `Analyze this panoramic dental radiograph and draft the JSON output as specified.${ctxLine}`
      }
    ];
  } else {
    throw new Error("Invalid mode");
  }

  const system = input.mode === "xray" ? `${SYSTEM_BASE}\n\n${SYSTEM_XRAY_ADDITION}` : SYSTEM_BASE;
  return { system, user: userContent };
}

// ----------------- Validate input -----------------
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function validateInput(body) {
  if (!body || typeof body !== "object") return "Body must be JSON object.";
  if (body.mode !== "text" && body.mode !== "structured" && body.mode !== "xray") {
    return "mode must be 'text', 'structured', or 'xray'.";
  }

  if (body.mode === "text") {
    if (typeof body.description !== "string") return "description must be a string.";
    const trimmed = body.description.trim();
    if (trimmed.length < 10) return "description is too short (minimum 10 characters).";
    if (trimmed.length > 2000) return "description is too long (maximum 2000 characters).";
  }
  if (body.mode === "structured") {
    if (!body.structured || typeof body.structured !== "object") return "structured payload required.";
    const s = body.structured;
    if (!s.tooth_position && !s.tooth_number) return "structured.tooth_position or structured.tooth_number required.";
    if (s.age != null && (s.age < 16 || s.age > 100)) return "age must be 16-100.";
  }
  if (body.mode === "xray") {
    if (typeof body.image_base64 !== "string" || body.image_base64.length === 0) {
      return "image_base64 (base64-encoded image) required.";
    }
    if (body.image_base64.length > MAX_IMAGE_BYTES) {
      return "Image too large. Max 5MB.";
    }
    if (typeof body.image_media_type !== "string" || !ALLOWED_IMAGE_TYPES.includes(body.image_media_type)) {
      return "image_media_type must be one of: " + ALLOWED_IMAGE_TYPES.join(", ");
    }
    if (body.context != null && typeof body.context !== "string") {
      return "context must be a string if provided.";
    }
    if (body.context && body.context.length > 500) {
      return "context too long (max 500 chars).";
    }
  }
  return null;
}

// ----------------- Anthropic call -----------------
async function callAnthropic({ apiKey, system, user }) {
  // user can be a string (text-only) or an array of content blocks (vision).
  const content = Array.isArray(user) ? user : user;
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content }]
    })
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new Error("Anthropic returned non-JSON: " + text.slice(0, 200));
  }
  // Extract first text block
  const block = (data.content || []).find(b => b.type === "text");
  if (!block) throw new Error("No text content in Anthropic response.");
  return { raw: block.text, usage: data.usage };
}

function extractJsonObject(text) {
  // Be tolerant if the model wraps the JSON in code fences or adds a preamble.
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  // Find first { and last } to bracket the JSON.
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) throw new Error("No JSON object found in model output.");
  const candidate = t.slice(first, last + 1);
  return JSON.parse(candidate);
}

// ----------------- Main handler -----------------
async function handleIntake(request, env) {
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body." }, { status: 400 }, cors);
  }

  const validationError = validateInput(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, { status: 400 }, cors);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY not configured on the worker." }, { status: 500 }, cors);
  }

  let promptParts;
  try {
    promptParts = buildPrompt(body);
  } catch (e) {
    return jsonResponse({ error: e.message }, { status: 400 }, cors);
  }

  let aiResponse;
  try {
    aiResponse = await callAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      system: promptParts.system,
      user: promptParts.user
    });
  } catch (e) {
    return jsonResponse({ error: "AI request failed: " + e.message }, { status: 502 }, cors);
  }

  let parsed;
  try {
    parsed = extractJsonObject(aiResponse.raw);
  } catch (e) {
    return jsonResponse({
      error: "Could not parse AI response as JSON.",
      raw_preview: aiResponse.raw.slice(0, 400)
    }, { status: 502 }, cors);
  }

  // If out of scope, return early — frontend renders a "needs partner-dentist review" card.
  if (parsed.in_scope === false) {
    return jsonResponse({
      mode: body.mode,
      in_scope: false,
      out_of_scope_reason: parsed.out_of_scope_reason || "Outside the v1 prototype scope.",
      findings: parsed.findings || null,
      narrative: parsed.narrative || null,
      ai_meta: { model: ANTHROPIC_MODEL, usage: aiResponse.usage }
    }, { status: 200 }, cors);
  }

  // Compute deterministic cost comparison from the rate card.
  const costs = computeCosts({
    may_need_bone_graft: !!(parsed.treatment_plan && parsed.treatment_plan.may_need_bone_graft)
  });

  const responsePayload = {
    mode: body.mode,
    in_scope: true,
    procedure: RATE_CARD.procedure_label,
    findings: parsed.findings,
    treatment_plan: parsed.treatment_plan,
    narrative: parsed.narrative,
    questions_for_dentist: parsed.questions_for_dentist || [],
    costs,
    ai_meta: { model: ANTHROPIC_MODEL, usage: aiResponse.usage }
  };

  return jsonResponse(responsePayload, { status: 200 }, cors);
}

// ----------------- Worker entry -----------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/intake" && request.method === "POST") {
      return handleIntake(request, env);
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({
        status: "ok",
        model: ANTHROPIC_MODEL,
        procedure: RATE_CARD.procedure_label,
        anthropic_key_configured: !!env.ANTHROPIC_API_KEY
      }, { status: 200 }, cors);
    }

    return jsonResponse({ error: "Not found.", path: url.pathname }, { status: 404 }, cors);
  }
};
