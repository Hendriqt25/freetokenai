import { NextResponse } from "next/server";
import { vioFetch } from "@/lib/vio";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, data } = await vioFetch(`/generations/${id}`);
  return NextResponse.json(data, { status });
}
