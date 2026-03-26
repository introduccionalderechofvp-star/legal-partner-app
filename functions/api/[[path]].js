function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function unauthorized() {
  return json({ error: 'PIN inválido o sesión no autorizada.' }, 401);
}

function getPinFromRequest(request) {
  return request.headers.get('x-app-pin') || '';
}

function ensureAuthorized(request, env) {
  const expectedPin = env.APP_PIN;
  if (!expectedPin) {
    return {
      ok: false,
      response: json({ error: 'Falta configurar APP_PIN en el entorno.' }, 500),
    };
  }

  const provided = getPinFromRequest(request);
  if (!provided || provided !== expectedPin) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true };
}

function normalizePartner(value) {
  return value === 'Felipe' || value === 'Hernan' ? value : null;
}

function normalizeType(value) {
  const allowed = ['normal_income', 'special_income', 'shared_expense'];
  return allowed.includes(value) ? value : null;
}

function parseAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function parsePercent(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

function validateMovement(input) {
  const partner = normalizePartner(input.partner);
  const enteredBy = normalizePartner(input.entered_by);
  const type = normalizeType(input.type);
  const amount = parseAmount(input.amount);
  const movementDate = typeof input.movement_date === 'string' ? input.movement_date : '';
  const concept = typeof input.concept === 'string' ? input.concept.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const paidToPartner = !!input.paid_to_partner;
  const specialPartnerPct = parsePercent(input.special_partner_pct);

  if (!partner) return { error: 'Socio inválido.' };
  if (!enteredBy) return { error: 'entered_by inválido.' };
  if (!type) return { error: 'Tipo de movimiento inválido.' };
  if (amount === null || amount <= 0) return { error: 'El valor debe ser un entero positivo.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) return { error: 'Fecha inválida.' };
  if (!concept) return { error: 'El concepto es obligatorio.' };

  let finalSpecialPct = null;
  if (type === 'special_income') {
    finalSpecialPct = specialPartnerPct ?? 50;
  }

  return {
    value: {
      partner,
      entered_by: enteredBy,
      type,
      amount,
      movement_date: movementDate,
      concept,
      notes,
      paid_to_partner: paidToPartner ? 1 : 0,
      special_partner_pct: finalSpecialPct,
    },
  };
}

async function listMovements(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      movement_date,
      partner,
      entered_by,
      type,
      concept,
      amount,
      special_partner_pct,
      paid_to_partner,
      notes,
      created_at,
      updated_at
    FROM movements
    ORDER BY movement_date ASC, created_at ASC, id ASC
  `).all();

  return result.results || [];
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const segments = pathname.split('/').filter(Boolean);
  const apiTail = segments.slice(1); // remove "api"

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type,x-app-pin',
      },
    });
  }

  if (apiTail.length === 1 && apiTail[0] === 'login' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.pin !== 'string') {
      return badRequest('PIN inválido.');
    }

    if (!env.APP_PIN) {
      return json({ error: 'Falta configurar APP_PIN en el entorno.' }, 500);
    }

    if (body.pin !== env.APP_PIN) {
      return unauthorized();
    }

    return json({ ok: true, partners: ['Felipe', 'Hernan'], cap: 8000000 });
  }

  const auth = ensureAuthorized(request, env);
  if (!auth.ok) return auth.response;

  if (apiTail.length === 1 && apiTail[0] === 'health') {
    return json({ ok: true, now: new Date().toISOString() });
  }

  if (apiTail.length === 1 && apiTail[0] === 'movements') {
    if (method === 'GET') {
      return json({ items: await listMovements(env) });
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('JSON inválido.');
      const parsed = validateMovement(body);
      if (parsed.error) return badRequest(parsed.error);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const movement = parsed.value;

      await env.DB.prepare(`
        INSERT INTO movements (
          id,
          movement_date,
          partner,
          entered_by,
          type,
          concept,
          amount,
          special_partner_pct,
          paid_to_partner,
          notes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          id,
          movement.movement_date,
          movement.partner,
          movement.entered_by,
          movement.type,
          movement.concept,
          movement.amount,
          movement.special_partner_pct,
          movement.paid_to_partner,
          movement.notes,
          now,
          now,
        )
        .run();

      const created = await env.DB.prepare('SELECT * FROM movements WHERE id = ?').bind(id).first();
      return json({ item: created }, 201);
    }
  }

  if (apiTail.length === 2 && apiTail[0] === 'movements') {
    const movementId = apiTail[1];

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('JSON inválido.');
      const parsed = validateMovement(body);
      if (parsed.error) return badRequest(parsed.error);
      const movement = parsed.value;
      const now = new Date().toISOString();

      const existing = await env.DB.prepare('SELECT id FROM movements WHERE id = ?').bind(movementId).first();
      if (!existing) return json({ error: 'Movimiento no encontrado.' }, 404);

      await env.DB.prepare(`
        UPDATE movements
        SET movement_date = ?,
            partner = ?,
            entered_by = ?,
            type = ?,
            concept = ?,
            amount = ?,
            special_partner_pct = ?,
            paid_to_partner = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?
      `)
        .bind(
          movement.movement_date,
          movement.partner,
          movement.entered_by,
          movement.type,
          movement.concept,
          movement.amount,
          movement.special_partner_pct,
          movement.paid_to_partner,
          movement.notes,
          now,
          movementId,
        )
        .run();

      const updated = await env.DB.prepare('SELECT * FROM movements WHERE id = ?').bind(movementId).first();
      return json({ item: updated });
    }

    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM movements WHERE id = ?').bind(movementId).run();
      return json({ ok: true });
    }
  }

  return json({ error: 'Ruta no encontrada.' }, 404);
}
