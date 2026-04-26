import { NextRequest, NextResponse } from "next/server";

type Event = {
  worker_id: string;
  ppe_status: string;
  detected: string[];
  timestamp: string;
  received_at: string;
};

const events: Event[] = [];
const MAX = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event: Event = {
      worker_id: body.worker_id ?? "unknown",
      ppe_status: body.ppe_status ?? "unknown",
      detected: body.detected ?? [],
      timestamp: body.timestamp ?? new Date().toISOString(),
      received_at: new Date().toISOString(),
    };
    events.unshift(event);
    if (events.length > MAX) events.pop();
    console.log(`[event] ${event.worker_id} ${event.ppe_status} ${JSON.stringify(event.detected)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ events });
}
