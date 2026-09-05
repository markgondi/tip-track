// Tip Track backend — state + auth + /api/debug health check
// Blobs is imported lazily so a module-load failure can never 502 every request.

const STORE_NAME = 'tip-track';
const STATE_KEY = 'current';
const AUTH_KEY = 'auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Lazy-import blobs so an import failure doesn't kill the cold start.
async function getBlobStore() {
  try {
    const mod = await import('@netlify/blobs');
    return mod.getStore(STORE_NAME);
  } catch (err) {
    throw new Error('blobs-import-failed: ' + (err?.message || String(err)));
  }
}

export default async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const url = new URL(req.url);
    const path = url.pathname;

    // Debug endpoint: tells us what's broken without needing logs
    if (path.endsWith('/debug')) {
      const info = {
        ok: true,
        path,
        method: req.method,
        node: typeof process !== 'undefined' ? process.version : 'unknown',
        runtime: typeof Deno !== 'undefined' ? 'deno' : 'node',
        env_has_site_id: !!(typeof process !== 'undefined' && process.env && (process.env.SITE_ID || process.env.NETLIFY_SITE_ID)),
        env_has_blobs_token: !!(typeof process !== 'undefined' && process.env && process.env.NETLIFY_BLOBS_CONTEXT)
      };
      try {
        const store = await getBlobStore();
        info.blobs_open = true;

        // Test AUTH read + measure
        try {
          const t0 = Date.now();
          const auth = await store.get(AUTH_KEY, { type: 'json' });
          info.auth_present = !!auth;
          info.auth_read_ms = Date.now() - t0;
          info.auth_keys = auth ? Object.keys(auth) : [];
        } catch (err) {
          info.auth_read_error = err?.message || String(err);
        }

        // Test STATE read + measure + size
        try {
          const t0 = Date.now();
          const stateRaw = await store.get(STATE_KEY, { type: 'json' });
          info.state_read_ms = Date.now() - t0;
          info.state_present = !!stateRaw;
          if (stateRaw) {
            const serialized = JSON.stringify(stateRaw);
            info.state_size_bytes = serialized.length;
            info.state_size_kb = Math.round(serialized.length / 1024);
            info.state_version = stateRaw.version;
            info.state_top_keys = Object.keys(stateRaw);
            if (stateRaw.state) info.inner_state_keys = Object.keys(stateRaw.state);
          }
        } catch (err) {
          info.state_read_error = err?.message || String(err);
        }
      } catch (err) {
        info.blobs_open = false;
        info.blobs_error = err?.message || String(err);
      }
      return jsonResponse(info);
    }

    const isAuth = path.endsWith('/auth');
    const store = await getBlobStore();

    if (isAuth) return await handleAuth(req, store);
    return await handleState(req, store);
  } catch (err) {
    console.error('function error:', err);
    return jsonResponse({ error: err?.message || 'internal error' }, 500);
  }
};

async function handleState(req, store) {
  if (req.method === 'GET') {
    const raw = await store.get(STATE_KEY, { type: 'json' });
    if (!raw) return jsonResponse({ state: null, updatedAt: null, version: 0 });
    return jsonResponse(raw);
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.state !== 'object') {
      return jsonResponse({ error: 'body must be { state: {...} }' }, 400);
    }
    const existing = await store.get(STATE_KEY, { type: 'json' });
    const prevVersion = existing?.version || 0;
    const payload = {
      state: body.state,
      updatedAt: new Date().toISOString(),
      version: prevVersion + 1,
      updatedBy: body.updatedBy || 'unknown'
    };
    await store.setJSON(STATE_KEY, payload);
    return jsonResponse({ updatedAt: payload.updatedAt, version: payload.version });
  }
  return jsonResponse({ error: 'method not allowed' }, 405);
}

async function handleAuth(req, store) {
  if (req.method === 'GET') {
    const raw = await store.get(AUTH_KEY, { type: 'json' });
    if (!raw) return jsonResponse({ ownerHash: null, viewerHash: null, salt: null });
    return jsonResponse({
      ownerHash: raw.ownerHash || null,
      viewerHash: raw.viewerHash || null,
      salt: raw.salt || null
    });
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await req.json().catch(() => null);
    if (!body || !body.ownerHash || !body.viewerHash || !body.salt) {
      return jsonResponse({ error: 'body must include ownerHash, viewerHash, salt' }, 400);
    }
    const existing = await store.get(AUTH_KEY, { type: 'json' });
    if (body.mode === 'setup') {
      if (existing && existing.ownerHash) {
        return jsonResponse({ error: 'Comp already set up' }, 403);
      }
    } else {
      if (!body.currentOwnerHash || !existing || body.currentOwnerHash !== existing.ownerHash) {
        return jsonResponse({ error: 'Wrong current owner password' }, 403);
      }
    }
    await store.setJSON(AUTH_KEY, {
      ownerHash: body.ownerHash, viewerHash: body.viewerHash, salt: body.salt,
      updatedAt: new Date().toISOString()
    });
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'method not allowed' }, 405);
}

export const config = {
  path: ['/api/state', '/api/auth', '/api/debug']
};
