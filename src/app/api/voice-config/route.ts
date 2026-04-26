import { NextResponse } from "next/server";

export async function GET() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) {
    return NextResponse.json({ ok: false, error: "ELEVENLABS_AGENT_ID not set" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, agentId });
}
