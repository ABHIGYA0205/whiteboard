import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Use the provided production URL as the primary target for the keep-alive cron
  const backendUrl = "https://whiteboard-r3n3.onrender.com";
  const healthEndpoint = `${backendUrl}/health`;

  console.log(`Cron job: Pinging backend at ${healthEndpoint}`);

  try {
    const response = await fetch(healthEndpoint, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: "Backend pinged successfully",
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (error) {
    console.error("Cron job failed:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to ping backend",
      },
      { status: 500 }
    );
  }
}
