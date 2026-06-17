import { NextResponse } from "next/server";
import { VERSION_STRING, LAST_DEPLOY } from '@/lib/version';

export async function GET() {
  return NextResponse.json({ message: "Hello, world!", version: VERSION_STRING, deployedAt: LAST_DEPLOY });
}