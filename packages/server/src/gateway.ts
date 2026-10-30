// The gateway: the app's public side of the assistant. It turns the app's own
// session into a Caller, checks whether the assistant may answer (key set, budget
// left, plan includes the agent…), and forwards to the agent worker through its
// service binding. Answers stream back untouched.
//
// Mount it under the app's API, e.g. app.route('/api/agent', createAgentGateway(...)):
//   GET    /agents        agents this caller may use
//   GET    /status        { ready, reason, message, provider, model }: the UI checks on open
//   POST   /stream        a question (SSE)
//   GET    /threads       conversations
//   GET    /threads/:id   one conversation (?agent=)
//   DELETE /threads/:id
import { Hono, type Context } from 'hono';
import { writeCaller, writeModel } from './headers.js';
import type { Caller, ModelChoice } from './types.js';

export type Blocked = { status: number; reason: string; message: string };
/** ok with an optional model (e.g. the tenant's own key), or why not. */
export type Preflight = { ok: true; model?: ModelChoice } | ({ ok: false } & Blocked);

export interface GatewayOptions<C extends Context = Context> {
	/** The agent worker's service binding. */
	agent: (c: C) => Fetcher | undefined;
	/** The person from the app's session, or null (401). */
	identify: (c: C) => Caller | null | Promise<Caller | null>;
	/** Runs before /status and /stream: missing key, budget reached… */
	preflight?: (c: C, caller: Caller) => Preflight | Promise<Preflight>;
	/** Per-agent gate (e.g. the thinking agent is only on bigger plans). */
	canUse?: (c: C, caller: Caller, agentId: string) => true | Blocked | Promise<true | Blocked>;
}

const OFFLINE = 'The assistant is offline.';

export function createAgentGateway<C extends Context = Context>(o: GatewayOptions<C>) {
	const app = new Hono();

	async function forward(c: C, caller: Caller, path: string, init: RequestInit & { model?: ModelChoice } = {}) {
		const binding = o.agent(c);
		if (!binding) return c.json({ error: OFFLINE }, 503);
		const headers = new Headers(init.headers);
		writeCaller(headers, caller);
		if (init.model) writeModel(headers, init.model);
		try {
			const r = await binding.fetch(new Request(`https://agent${path}`, { method: init.method ?? 'GET', body: init.body, headers, signal: c.req.raw.signal }));
			return new Response(r.body, { status: r.status, headers: r.headers });
		} catch (e) {
			console.error('agent worker unreachable', e);
			return c.json({ error: OFFLINE }, 503);
		}
	}

	const who = async (c: C) => {
		const caller = await o.identify(c);
		return caller ?? null;
	};

	app.get('/agents', async (c) => {
		const ctx = c as unknown as C;
		const caller = await who(ctx);
		if (!caller) return c.json({ error: 'Not signed in.' }, 401);
		const r = await forward(ctx, caller, '/agents');
		if (!r.ok || !o.canUse) return r;
		const list = (await r.json()) as { id: string }[];
		const allowed = await Promise.all(list.map(async (a) => (await o.canUse!(ctx, caller, a.id)) === true));
		return c.json(list.filter((_, i) => allowed[i]));
	});

	app.get('/status', async (c) => {
		const ctx = c as unknown as C;
		const caller = await who(ctx);
		if (!caller) return c.json({ error: 'Not signed in.' }, 401);
		const p = (await o.preflight?.(ctx, caller)) ?? { ok: true as const };
		return c.json(p.ok
			? { ready: true, reason: null, message: null, provider: p.model?.provider ?? 'workers-ai', model: p.model?.model ?? null }
			: { ready: false, reason: p.reason, message: p.message });
	});

	app.post('/stream', async (c) => {
		const ctx = c as unknown as C;
		const caller = await who(ctx);
		if (!caller) return c.json({ error: 'Not signed in.' }, 401);
		const p = (await o.preflight?.(ctx, caller)) ?? { ok: true as const };
		if (!p.ok) return c.json({ error: p.message, reason: p.reason }, p.status as 400);
		const body = await c.req.text();
		let agentId = '';
		try { agentId = String((JSON.parse(body) as { agent?: unknown }).agent ?? ''); } catch { return c.json({ error: 'Invalid body.' }, 400); }
		if (agentId && o.canUse) {
			const ok = await o.canUse(ctx, caller, agentId);
			if (ok !== true) return c.json({ error: ok.message, reason: ok.reason }, ok.status as 400);
		}
		return forward(ctx, caller, '/stream', { method: 'POST', body, headers: { 'content-type': 'application/json' }, model: p.model });
	});

	app.get('/threads', async (c) => {
		const caller = await who(c as unknown as C);
		return caller ? forward(c as unknown as C, caller, '/threads') : c.json([], 401);
	});

	app.get('/threads/:id', async (c) => {
		const caller = await who(c as unknown as C);
		if (!caller) return c.json([], 401);
		return forward(c as unknown as C, caller, `/threads/${encodeURIComponent(c.req.param('id'))}?agent=${encodeURIComponent(c.req.query('agent') ?? '')}`);
	});

	app.delete('/threads/:id', async (c) => {
		const caller = await who(c as unknown as C);
		if (!caller) return c.json({ ok: false }, 401);
		return forward(c as unknown as C, caller, `/threads/${encodeURIComponent(c.req.param('id'))}`, { method: 'DELETE' });
	});

	return app;
}
