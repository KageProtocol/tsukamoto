import "server-only";

export async function GET() {
  const api = process.env.NEXT_PUBLIC_OTC_API_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${api}/order`, { cache: "no-store" });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
