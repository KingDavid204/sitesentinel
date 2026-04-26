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

    const db = await getDb();
    await db.collection<EventDoc>(COLLECTION).insertOne(event);

    console.log(`[event] ${event.worker_id} ${event.ppe_status} ${JSON.stringify(event.detected)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/events POST] failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = await getDb();
    const events = await db
      .collection<EventDoc>(COLLECTION)
      .find({}, { projection: { _id: 0 } })
      .sort({ received_at: -1 })
      .limit(RECENT_LIMIT)
      .toArray();
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[/api/events GET] failed:", e);
    return NextResponse.json({ events: [], error: String(e) }, { status: 500 });
  }
}
