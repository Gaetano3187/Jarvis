// app/api/analytics/route.js
export const dynamic = 'force-dynamic'; // evita caching statico
const cors = (req) => {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
};

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function HEAD(req) {
  return new Response(null, { status: 200, headers: cors(req) });
}

export async function GET(req) {
  return new Response(
    JSON.stringify({ ok: true, route: 'analytics', method: 'GET' }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...cors(req) } }
  );
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = {
      receivedAt: new Date().toISOString(),
      receivedPayload: body,
    };
    return new Response(
      JSON.stringify({ ok: true, data: result }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors(req) } }
    );
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors(req) } }
    );
  }
}
