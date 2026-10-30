// The agent worker: Mastra agents behind a few plain routes, reached only through
// a service binding from the gateway (no public route).
//
//   GET    /agents        the agents (id, name, tagline, thinking)
//   POST   /stream        one question: Mastra's stream as slim SSE
//   GET    /threads       the person's recent conversations (all agents)
//   GET    /threads/:id   one conversation, shaped as the UI draws it (?agent=)
//   DELETE /threads/:id   delete a conversation
//
// Own routes rather than Mastra's REST server: importing that route table at load
// costs most of a Worker's startup budget.
import { Hono, type Context } from 'hono';
import { Agent, Mastra, RequestContext, d1Memory, workersAIOptions, type AiBinding } from '@rubrion/mastra-cloudflare';
import { readCaller, HEADER } from './headers.js';
import { DEFAULT_MODEL, isWorkersAI, priceOf, readModelChoice, resolveModel, PRICES, type Providers } from './models.js';
import { defaultErrorMessage, slim, sse, SSE_DONE, usageOf } from './stream.js';
import { toTurns, type StoredMessage } from './turns.js';
import type { AgentDefinition, Caller, ModelChoice, Price, Usage } from './types.js';

export interface AgentWorkerOptions<E> {
	agents: AgentDefinition[];
	/** The Workers AI binding. */
	ai: (env: E) => AiBinding;
	/** The D1 database for Mastra Memory (tables are created on first use). */
	memory: (env: E) => D1Database;
	/** Messages recalled into each prompt. Default 8. */
	lastMessages?: number;
	/** Conversations kept per person; the oldest is deleted past this. Default 50. */
	maxThreads?: number;
	/** Tool-call rounds per answer. Default 8. */
	maxSteps?: number;
	/** Longest question accepted, in characters. Default 4000. */
	maxQuestion?: number;
	/** The model when the gateway sends none. Default: Workers AI Gemma. */
	defaultModel?: ModelChoice;
	prices?: Record<string, Price>;
	/** Bring-your-own-key providers the gateway may select (see Providers). Off by default. */
	providers?: Providers;
	/**
	 * Text appended to the instructions on every question: a snapshot of what
	 * exists (projects, team…), so the agent knows the ground before calling tools.
	 */
	context?: (args: { caller: Caller; env: E; agent: AgentDefinition }) => string | Promise<string>;
	/**
	 * Wraps each request, e.g. to put the tenant in an AsyncLocalStorage that the
	 * tools read so every query is scoped. Must return what `next` returns.
	 */
	scope?: (args: { caller: Caller; env: E }, next: () => Promise<Response>) => Promise<Response>;
	/** Reported when an answer ends: log it, bill it, enforce a monthly cap. */
	onUsage?: (usage: Usage, env: E) => void | Promise<void>;
	/** Turns provider errors into something the person can act on. */
	errorMessage?: (raw: string) => string;
}

const CLIENT_ID = /^[a-z0-9]{6,32}$/i;
const TITLE_CHARS = 60;

type StoredThread = { id: string; title?: string; updatedAt: Date; metadata?: Record<string, unknown> };

export function createAgentWorker<E extends object = Record<string, unknown>>(o: AgentWorkerOptions<E>) {
	const lastMessages = o.lastMessages ?? 8;
	const maxThreads = o.maxThreads ?? 50;
	const maxSteps = o.maxSteps ?? 8;
	const maxQuestion = o.maxQuestion ?? 4000;
	const prices = { ...PRICES, ...o.prices };
	const errorMessage = o.errorMessage ?? defaultErrorMessage;
	const fallback = o.defaultModel ?? { provider: 'workers-ai' as const, model: DEFAULT_MODEL };
	if (!o.agents.length) throw new Error('createAgentWorker: at least one agent');

	// Bindings are stable per isolate; memory and agents are built on the first request.
	let current: E | undefined;
	const getMemory = d1Memory(() => o.memory(current!), { id: 'agent-kit-memory', lastMessages });
	const built = new Map<string, Agent>();
	let mastra: Mastra | undefined;

	const definition = (id: unknown) => o.agents.find((a) => a.id === id) ?? o.agents[0];
	function agentOf(def: AgentDefinition) {
		let agent = built.get(def.id);
		if (!agent) {
			agent = new Agent({
				id: def.id,
				name: def.name,
				instructions: def.instructions,
				// the model is resolved per request: the tenant may bring its own key
				model: (({ requestContext }: { requestContext?: RequestContext }) =>
					resolveModel((requestContext?.get('model') as ModelChoice | undefined) ?? fallback, o.ai(current!), Boolean(def.thinking), o.providers)) as never,
				tools: def.tools as never,
				memory: () => getMemory(),
			});
			built.set(def.id, agent);
		}
		return agent;
	}

	/** Conversations belong to tenant + person; nobody opens another's. */
	const ownerOf = (c: Caller) => `t${c.tenant}-p${c.person}`;
	const clientId = (thread: unknown) => (typeof thread === 'string' && CLIENT_ID.test(thread) ? thread : 'default');
	const threadId = (owner: string, thread: unknown, agent: string) => `${owner}-${clientId(thread)}-${agent}`;

	async function threadsOf(owner: string): Promise<StoredThread[]> {
		const r = await getMemory()
			.listThreads({ filter: { resourceId: owner }, orderBy: { field: 'updatedAt', direction: 'DESC' }, perPage: false })
			.catch(() => ({ threads: [] as StoredThread[] }));
		return r.threads as StoredThread[];
	}

	/** Creates the thread on its first message, titled by it, and keeps only the newest maxThreads. */
	async function openThread(owner: string, thread: unknown, agent: string, message: string) {
		const memory = getMemory();
		const id = threadId(owner, thread, agent);
		if (await memory.getThreadById({ threadId: id }).catch(() => null)) return id;
		const now = new Date();
		const title = message.replace(/\s+/g, ' ').trim().slice(0, TITLE_CHARS) || '…';
		await memory.saveThread({ thread: { id, resourceId: owner, title, metadata: { agent, client: clientId(thread) }, createdAt: now, updatedAt: now } });
		const old = (await threadsOf(owner)).slice(maxThreads);
		await Promise.all(old.map((t) => memory.deleteThread(t.id).catch(() => undefined)));
		return id;
	}

	type Env = { Bindings: E; Variables: { caller: Caller } };
	const app = new Hono<Env>();

	app.use(async (c, next) => {
		current = c.env;
		const caller = readCaller(c.req.raw.headers);
		if (!caller) return c.json({ error: 'Unknown caller.' }, 401);
		c.set('caller', caller);
		if (!o.scope) return next();
		return o.scope({ caller, env: c.env }, async () => { await next(); return c.res; });
	});

	app.get('/agents', (c) => c.json(o.agents.map(({ id, name, tagline, thinking }) => ({ id, name, tagline, thinking: Boolean(thinking) }))));

	app.post('/stream', async (c) => {
		const caller = c.get('caller');
		const body = (await c.req.json().catch(() => null)) as { agent?: string; message?: string; thread?: string } | null;
		const message = typeof body?.message === 'string' ? body.message.trim().slice(0, maxQuestion) : '';
		if (!message) return c.json({ error: 'Empty question.' }, 400);

		mastra ??= new Mastra({ agents: Object.fromEntries(o.agents.map((a) => [a.id, agentOf(a)])) });
		const def = definition(body?.agent);
		const agent = agentOf(def);
		const asked = readModelChoice(c.req.header(HEADER.model), fallback);
		const choice = asked.provider === 'workers-ai' || o.providers?.[asked.provider] ? asked : fallback;
		const price = priceOf(choice, prices);
		const owner = ownerOf(caller);
		const thread = await openThread(owner, body?.thread, def.id, message);

		const extra = await Promise.resolve(o.context?.({ caller, env: c.env, agent: def })).catch(() => '');
		const who = caller.name ? `The person asking: ${caller.name}.` : '';
		const instructions = [def.instructions, who, extra].filter(Boolean).join('\n\n');

		const result = await agent.stream([{ role: 'user', content: message }] as never, {
			requestContext: new RequestContext([['caller', caller], ['model', choice]]),
			// Mastra Memory recalls the thread's last messages; the UI sends only the new one.
			memory: { thread, resource: owner },
			maxSteps,
			// temperature 0 on Workers AI: the same question over the same data gives the same answer
			modelSettings: isWorkersAI(choice) ? { maxOutputTokens: def.maxOutputTokens ?? 1200, temperature: 0 } : { maxOutputTokens: 8000 },
			providerOptions: (isWorkersAI(choice) ? workersAIOptions(Boolean(def.thinking)) : undefined) as never,
			instructions,
			abortSignal: c.req.raw.signal,
		});

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();
		const enc = new TextEncoder();
		const send = (s: string) => writer.write(enc.encode(s));

		// No await: the response goes out while this keeps writing to it.
		c.executionCtx.waitUntil((async () => {
			const reader = result.fullStream.getReader();
			let input = 0;
			let output = 0;
			let error = '';
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					const ev = slim(value, errorMessage);
					if (!ev) continue;
					if (ev.type === 'step-finish') {
						const u = usageOf(value);
						input += u.input;
						output += u.output;
					} else if (ev.type === 'finish' && !input && !output) {
						const u = usageOf(value);
						input = u.input;
						output = u.output;
					}
					if (ev.type === 'error') error = ev.message;
					await send(sse(ev));
				}
			} catch (e) {
				error = (e as Error).message;
				await send(sse({ type: 'error', message: errorMessage(error) })).catch(() => undefined);
			} finally {
				const usage: Usage = {
					caller, agent: def.id, thread, provider: choice.provider, model: choice.model,
					inputTokens: input, outputTokens: output, costUsd: (input * price.input + output * price.output) / 1_000_000,
					status: error ? 'error' : 'ok', ...(error ? { error: error.slice(0, 500) } : {}),
				};
				await Promise.resolve(o.onUsage?.(usage, c.env)).catch((e) => console.error('onUsage failed', e));
				await send(SSE_DONE).catch(() => undefined);
				await writer.close().catch(() => undefined);
			}
		})());

		return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
	});

	app.get('/threads', async (c) => {
		const threads = (await threadsOf(ownerOf(c.get('caller')))).filter((t) => t.metadata?.agent && t.metadata?.client);
		return c.json(threads.slice(0, maxThreads).map((t) => ({ id: t.metadata!.client, agent: t.metadata!.agent, title: t.title ?? '', updatedAt: t.updatedAt })));
	});

	/** A stored conversation as the UI draws it: the person's text; the agent's steps and text. */
	app.get('/threads/:id', async (c: Context<Env>) => {
		const owner = ownerOf(c.get('caller'));
		const agent = definition(c.req.query('agent')).id;
		const { messages } = await getMemory()
			.recall({ threadId: threadId(owner, c.req.param('id'), agent), resourceId: owner, perPage: false })
			.catch(() => ({ messages: [] as unknown[] }));
		return c.json(toTurns(messages as StoredMessage[], agent));
	});

	app.delete('/threads/:id', async (c) => {
		const owner = ownerOf(c.get('caller'));
		const memory = getMemory();
		await Promise.all(o.agents.map((a) => memory.deleteThread(threadId(owner, c.req.param('id'), a.id)).catch(() => undefined)));
		return c.json({ ok: true });
	});

	return { fetch: app.fetch, app };
}
