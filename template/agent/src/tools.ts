// The demo's tools: small, read-only, returning facts. A real app replaces these
// with tools over its own data (scoped to the caller's tenant, see the `scope`
// option and README "Tenant scoping").
//
// Rule of thumb for tools: return FACTS already computed (dates, totals, "overdue
// by 3 days"), so the model never does math or guesses. When data is missing,
// say so explicitly ({ found: false, reason }) so the agent asks instead of inventing.
import { createTool, z } from '@rubrion/agent-kit-server';

const TOPICS: Record<string, { title: string; body: string }> = {
	overview: {
		title: 'What the kit is',
		body: `agent-kit embeds an AI assistant in a Cloudflare app. Three pieces:
1. @rubrion/agent-kit-server createAgentWorker: a Worker running Mastra agents with D1 memory, streaming slim SSE events (text, reasoning, tool calls/results). No public route.
2. @rubrion/agent-kit-server createAgentGateway: Hono routes mounted in the app's own Worker. Turns the app session into a Caller, runs a preflight (key set? budget left?), forwards to the agent worker through a service binding.
3. @rubrion/agent-kit-react: AgentProvider (conversation state above the router), ChatBox (floating, non-modal, in every screen) and AssistantScreen (full page with agent picker and conversation list).
The template folder is a working app with all three; copy it and replace the agents and tools.`,
	},
	architecture: {
		title: 'Request flow',
		body: `Browser -> app Worker /api/agent/stream (gateway) -> identify(c) builds the Caller {tenant, person, role, name} from the app session -> preflight -> service binding fetch to the agent worker with X-Agent-* headers -> agent.stream with Mastra Memory (thread per tenant+person+agent) -> SSE back: data: {type...} lines, ending with data: [DONE].
The browser sends only the new question; memory recalls the last messages (default 8). The browser remembers only which thread was open (localStorage).
Conversations are private to tenant+person; up to 50 kept per person, oldest deleted.`,
	},
	agents: {
		title: 'Declaring agents',
		body: `An AgentDefinition: { id, name, tagline, thinking, tools, maxOutputTokens, instructions }. thinking=true turns reasoning on (Workers AI) and the UI shows it folded. Offer the same tools at two speeds (fast and thinking) like the demo.
Instructions that work: say where facts come from (only tools/context), ask when the subject is ambiguous instead of choosing, repeat numbers as tools return them, state the limits (read-only, no financial data).`,
	},
	tools: {
		title: 'Writing tools',
		body: `Use createTool and z (re-exported by @rubrion/agent-kit-server). Keep tools small and read-only, each answering one kind of question; return computed facts (no math left to the model) and { found: false, reason } when data is missing. Resolve names to ids in a dedicated search tool and make the other tools take ids; when the search returns none or several, the agent asks.
To write data, prefer drafts: a tool returns a draft object (never writes); the UI renders a card with a link; the person confirms and the app's normal API persists it.`,
	},
	scoping: {
		title: 'Tenant scoping',
		body: `createAgentWorker({ scope: ({ caller, env }, next) => tenantStore.run(caller.tenant, next) }) wraps every request. Tools read the tenant from the AsyncLocalStorage and every query filters by it. Add a test that a tool called as tenant B never returns tenant A's rows.`,
	},
	models: {
		title: 'Models and cost',
		body: `Default model: Workers AI @cf/google/gemma-4-26b-a4b-it ($0.10 input / $0.30 output per million tokens), temperature 0. A tenant may bring its own Anthropic or OpenAI key: the gateway preflight returns { ok: true, model: { provider, model, key } } and the key travels only inside that request (X-Agent-Model header over the service binding).
onUsage(usage) reports tokens and USD per answer: write it to the app database and check a monthly cap in the gateway preflight.`,
	},
	react: {
		title: 'Using the React UI',
		body: `<AgentProvider person={id} personName={name} strings={ptBR} toolLabels={{ my_tool: ['Looking…', 'Looked'] }} suggestions={[...]} renderMascot={...} renderBlocked={...}> wraps the app above the router.
<ChatBox onExpand={() => navigate('/assistant')} hidden={path === '/assistant'} /> in the layout; <AssistantScreen /> on the assistant route.
Import '@rubrion/agent-kit-react/styles.css' and add @source "../node_modules/@rubrion/agent-kit-react/dist" to the Tailwind CSS. Components use shadcn/ui tokens (bg-card, text-muted-foreground, ring-ring…).`,
	},
	deploy: {
		title: 'Deploying',
		body: `1. wrangler d1 create <name>-memory and put the id in template/agent/wrangler.jsonc.
2. npm run deploy -w template/agent (no public route).
3. Set the web worker's custom domain, the Access team domain and the application AUD in template/web/wrangler.jsonc, then npm run deploy -w template/web.
4. Protect the hostname with a Cloudflare Access application; the web worker verifies the Access JWT itself too.`,
	},
};

export const tools = {
	today: createTool({
		id: 'today',
		description: "Today's date (UTC) and weekday. Use only when the question needs the date.",
		inputSchema: z.object({}),
		execute: async () => {
			const d = new Date();
			return { date: d.toISOString().slice(0, 10), weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) };
		},
	}),
	list_topics: createTool({
		id: 'list_topics',
		description: 'The documentation topics of the kit: id and title. Call first, then read_topic.',
		inputSchema: z.object({}),
		execute: async () => ({ topics: Object.entries(TOPICS).map(([id, t]) => ({ id, title: t.title })) }),
	}),
	read_topic: createTool({
		id: 'read_topic',
		description: 'The full text of one documentation topic, by id (from list_topics).',
		inputSchema: z.object({ topic: z.string().describe('Topic id, e.g. "gateway"') }),
		execute: async ({ topic }: { topic: string }) => {
			const t = TOPICS[topic.trim().toLowerCase()];
			return t ? { found: true, id: topic, ...t } : { found: false, reason: `No topic "${topic}". Valid ids: ${Object.keys(TOPICS).join(', ')}.` };
		},
	}),
};
