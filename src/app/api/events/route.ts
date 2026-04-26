import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

type Detection = [string, number];

type EventDoc = {
  worker_id: string;
  ppe_status: string;
  detected: Detection[];
  timestamp: string;
  received_at: string;
};

const COLLECTION = "events";
const RECENT_LIMIT = 100;

// In-memory ring buffer. Source of truth for the dashboard so the live
// pipeline keeps working when MongoDB Atlas is unreachable (e.g. wifi off
// during the offline-demo moment). Mongo is best-effort — durability layer
// for the audit trail, not a runtime dependency for the safety check.
type GlobalWithBuf = typeof globalThis & { __sitesentinelEventBuf?: EventDoc[] };
const g = globalThis as GlobalWithBuf;
g.__sitesentinelEventBuf ??= [];
const buf = g.__sitesentinelEventBuf;

function pushLocal(event: EventDoc) {
  buf.unshift(event);
  if (buf.length > RECENT_LIMIT) buf.length = RECENT_LIMIT;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event: EventDoc = {
      worker_id: body.worker_id ?? "unknown",
      ppe_status: body.ppe_status ?? "unknown",
      detected: body.detected ?? [],
      timestamp: body.timestamp ?? new Date().toISOString(),
      received_at: new Date().toISOString(),
    };

    pushLocal(event);
    console.log(`[event] ${event.worker_id} ${event.ppe_status} ${JSON.stringify(event.detected)}`);

    // Best-effort durable write. Failure (e.g. Mongo unreachable while
    // wifi is off) is logged but does NOT fail the request — the kiosk
    // pipeline must keep working offline.
    try {
      const db = await getDb();
      await db.collection<EventDoc>(COLLECTION).insertOne(event);
    } catch (mongoErr) {
      console.warn("[/api/events POST] mongo write skipped:", String(mongoErr).split("\n")[0]);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/events POST] failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  // Always serve from the in-memory buffer. Reliable, fast, offline-safe.
  // Mongo is the audit trail, not the read path for the live dashboard.
  return NextResponse.json({ events: buf });
}
