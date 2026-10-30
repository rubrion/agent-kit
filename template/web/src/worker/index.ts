// The app's Worker: serves the React app (assets) and fronts the assistant.
// In a real app this is your existing API Worker: add the gateway route and the
// AGENT service binding.
import { Hono } from 'hono';
import { createAgentGateway, type Caller } from '@rubrion/agent-kit-server/gateway';
import { accessEmail } from './access';

interface Env {
	AGENT: Fetcher;
	ACCESS_TEAM_DOMAIN: string;
	ACCESS_AUD: string;
	DEV_USER?: string;
}

const app = new Hono<{ Bindings: Env }>();

/** The person from the app's session. Here, Cloudflare Access; in a real app, your login. */
async function who(req: Request, env: Env): Promise<Caller | null> {
	const email = (await accessEmail(req, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD)) ?? (env.DEV_USER || null);
	if (!email) return null;
	const local = email.split('@')[0];
	// One tenant per email domain: colleagues share nothing but the tenant id here,
	// since conversations are per person anyway.
	return { tenant: email.split('@')[1].replace(/[^a-z0-9.-]/gi, ''), person: email.replace(/[^a-z0-9_.@-]/gi, ''), role: 'member', name: local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
}

app.get('/api/me', async (c) => {
	const caller = await who(c.req.raw, c.env);
	return caller ? c.json({ email: caller.person, name: caller.name }) : c.json({ error: 'Not signed in.' }, 401);
});

app.route('/api/agent', createAgentGateway({
	agent: (c) => (c.env as Env).AGENT,
	identify: (c) => who(c.req.raw, c.env as Env),
	// A real app checks here: the tenant's own key is set, the monthly budget is left…
	preflight: () => ({ ok: true }),
}));

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

export default app;
