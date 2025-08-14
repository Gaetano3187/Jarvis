// app/api/brain/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cors(req) {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: cors(req) });
}
export async function HEAD(req) {
  return new Response(null, { status: 200, headers: cors(req) });
}

export async function GET(req) {
  return new Response(
    JSON.stringify({ ok: true, route: 'brain', method: 'GET' }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...cors(req) } }
  );
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { handleBrainRequest } = await import('@/lib/brainRouter.js');
    const result = await handleBrainRequest(body);
    const status = result?.ok === false ? 400 : 200;
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors(req) },
    });
  } catch (err) {
    console.error('Brain route error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors(req) } }
    );
  }
}
