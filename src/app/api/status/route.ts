import { NextResponse } from "next/server";
import { getStatus } from "@/lib/wiki-engine";

export async function GET() {
  return NextResponse.json(getStatus());
}
