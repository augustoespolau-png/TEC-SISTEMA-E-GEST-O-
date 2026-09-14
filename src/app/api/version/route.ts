import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      app: "tecverde-erros",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      environment: process.env.VERCEL_ENV ?? "unknown",
      features: {
        multiNa: true,
        photoAttachment: true,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
