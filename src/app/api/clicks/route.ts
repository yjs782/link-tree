import { NextResponse } from "next/server";
import { getClicksCollection } from "@/lib/mongodb";

export async function GET() {
  const collection = await getClicksCollection();
  const docs = await collection.find().toArray();

  const counts: Record<string, number> = {};
  for (const doc of docs) {
    counts[doc._id] = doc.count;
  }

  return NextResponse.json(counts);
}
