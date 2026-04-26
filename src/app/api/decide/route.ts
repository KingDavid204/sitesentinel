import { NextRequest, NextResponse } from "next/server";
import { authenticatedAgentIdentity } from "@/lib/auth0-agent";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e4b";

type Detection = [string, number];

type DecideBody = {
  worker_id?: string;
  ppe_status?: string;
  detected?: Detection[];
  transcript?: { question: string; answer: string }[];
};

type Verdict = {
  verdict: "fit" | "unfit" | "review";
  reason: string;
};

const SYSTEM_PROMPT = `You are SiteSentinel, a construction-site pre-shift safety officer.
You receive: a worker's PPE detection result and their answers to 3 brief safety questions.
You output STRICT JSON ONLY in this shape: {"verdict":"fit"|"unfit"|"review","reason":"<one short sentence under 20 words>"}
Rules:
- If PPE is missing (missing_hat or missing_vest) -> verdict MUST be "unfit".
- If the worker reports pain, injury, poor sleep, or being unwell -> verdict MUST be "unfit".
- If the worker is hesitant or unclear -> verdict "review".
- Otherwise -> "fit".
Output JSON ONLY. No prose, no code fences, no explanation outside the JSON.`;

function buildUserPrompt(body: DecideBody): string {
  const transcript = (body.transcript ?? [])
    .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
    .join("\n");
  return `PPE status: ${body.ppe_status ?? "unknown"}
Detections: ${JSON.stringify(body.detected ?? [])}
Worker transcript:
${transcript || "(no transcript provided)"}
Decide.`;
}

function safeParseVerdict(raw: string): Verdict {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : cleaned;
  try {
    const parsed = JSON.parse(candidate);
    const v = String(parsed.verdict ?? "review").toLowerCase();
    const verdict: Verdict["verdict"] =
      v === "fit" || v === "unfit" || v === "review" ? (v as Verdict["verdict"]) : "review";
    const reason = String(parsed.reason ?? "no reason provided").slice(0, 200);
    return { verdict, reason };
  } catch {
    return { verdict: "review", reason: "model output unparseable" };
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify the SafetyOfficerAgent's Auth0 identity before making any decision.
    // The agent has its own scoped client_credentials identity — it never holds
    // a user/master key. Best-effort so transient Auth0 issues don't block the
    // safety decision; cached token + JWKS make this fast after first call.
    let agentIdentity: Awaited<ReturnType<typeof authenticatedAgentIdentity>> | null = null;
    let agentAuthError: string | null = null;
    try {
      agentIdentity = await authenticatedAgentIdentity();
    } catch (e) {
      agentAuthError = e instanceof Error ? e.message : String(e);
      console.warn("[/api/decide] agent auth failed (continuing):", agentAuthError);
    }

    const body = (await req.json()) as DecideBody;
    const userPrompt = buildUserPrompt(body);

    const t0 = Date.now();
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 120 },
      }),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      return NextResponse.json(
        { ok: false, error: `ollama ${ollamaRes.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await ollamaRes.json();
    const verdict = safeParseVerdict(data.response ?? "");
    const elapsed_ms = Date.now() - t0;

    console.log(
      `[/api/decide] ${verdict.verdict} (${elapsed_ms}ms) signed_by=${
        agentIdentity?.agent_id ?? "UNVERIFIED"
      }: ${verdict.reason}`
    );

    return NextResponse.json({
      ok: true,
      ...verdict,
      worker_id: body.worker_id ?? "unknown",
      elapsed_ms,
      agent: agentIdentity
        ? {
            verified: true,
            agent_id: agentIdentity.agent_id,
            issuer: agentIdentity.issuer,
            audience: agentIdentity.audience,
          }
        : { verified: false, error: agentAuthError },
    });
  } catch (e) {
    console.error("[/api/decide] failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
