import { AgentProvider, AssistantScreen, ChatBox, Mascot } from '@rubrion/agent-kit-react';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

type Me = { email: string; name: string };

/** Tiny hash router: '#/assistant' is the full screen, anything else is home. */
function useRoute() {
	const read = () => (location.hash.replace(/^#/, '') || '/');
	const [route, setRoute] = useState(read);
	useEffect(() => {
		const on = () => setRoute(read());
		addEventListener('hashchange', on);
		return () => removeEventListener('hashchange', on);
	}, []);
	return [route, (to: string) => { location.hash = to; }] as const;
}

function useTheme() {
	const [dark, setDark] = useState(() => {
		try { return localStorage.getItem('theme') ? localStorage.getItem('theme') === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
	});
	useEffect(() => {
		document.documentElement.classList.toggle('dark', dark);
		try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* this tab only */ }
	}, [dark]);
	return [dark, () => setDark((d) => !d)] as const;
}

export function App() {
	const [me, setMe] = useState<Me | null | 'out'>(null);
	const [route, go] = useRoute();
	const [dark, toggle] = useTheme();
	useEffect(() => {
		fetch('/api/me').then((r) => (r.ok ? r.json() : 'out')).then(setMe).catch(() => setMe('out'));
	}, []);
	if (me === null) return null;
	if (me === 'out') return <p className="p-8 text-sm text-muted-foreground">Sign in through Cloudflare Access to use the assistant.</p>;

	return (
		<AgentProvider
			person={me.email}
			personName={me.name}
			storageKey="agent-kit-demo"
			toolLabels={{
				today: ['Checking the date', 'Checked the date'],
				list_topics: ['Listing the docs', 'Listed the docs'],
				read_topic: ['Reading the docs', 'Read the docs'],
			}}
			suggestions={['What is in the kit?', 'How do I add my own tools?', 'How do I deploy it?']}
		>
			<div className="flex h-full flex-col">
				<header className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
					<a href="#/" className="flex items-center gap-2 font-semibold tracking-tight"><Mascot size={26} /> agent-kit</a>
					<nav className="ml-4 flex gap-1 text-sm">
						<NavLink to="/" current={route !== '/assistant'}>Overview</NavLink>
						<NavLink to="/assistant" current={route === '/assistant'}>Assistant</NavLink>
					</nav>
					<span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{me.email}</span>
					<button type="button" onClick={toggle} title="Theme" aria-label="Theme" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent [&_svg]:size-4">
						{dark ? <Sun /> : <Moon />}
					</button>
				</header>
				<main className="min-h-0 flex-1 overflow-y-auto">
					{route === '/assistant' ? <AssistantScreen /> : <Overview />}
				</main>
			</div>
			<ChatBox hidden={route === '/assistant'} onExpand={() => go('/assistant')} subtitle="the kit's documentation" />
		</AgentProvider>
	);
}

function NavLink({ to, current, children }: { to: string; current: boolean; children: ReactNode }) {
	return <a href={`#${to}`} aria-current={current ? 'page' : undefined} className={`rounded-md px-2.5 py-1 ${current ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-muted'}`}>{children}</a>;
}

function Code({ children }: { children: string }) {
	return <pre className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed">{children}</pre>;
}

function Overview() {
	return (
		<article className="mx-auto grid max-w-3xl gap-8 px-4 py-10">
			<section className="grid gap-3">
				<h1 className="text-3xl font-semibold tracking-tight">An AI assistant for any Cloudflare app</h1>
				<p className="text-muted-foreground">
					The assistant from Cerne, extracted: Mastra agents on a Worker with D1 memory, a gateway in your app's Worker, and a React chat
					(floating box on every screen plus a full screen) that streams the agent's thinking, tool calls and answer. The button in the corner
					is this kit running: ask it how to use the kit.
				</p>
			</section>
			<section className="grid gap-3">
				<h2 className="text-lg font-semibold">1 · The agent worker</h2>
				<Code>{`import { createAgentWorker, createTool, z } from '@rubrion/agent-kit-server';

export default createAgentWorker<Env>({
  agents: [{ id: 'main', name: 'Assistant', tagline: 'Everyday questions',
             tools: { my_tool }, instructions: '…' }],
  ai: (env) => env.AI,
  memory: (env) => env.MEMORY,          // D1, tables created on first use
  context: ({ caller }) => snapshotFor(caller.tenant),
  scope: ({ caller }, next) => tenant.run(caller.tenant, next),
  onUsage: (u) => logCost(u),           // tokens + USD per answer
});`}</Code>
			</section>
			<section className="grid gap-3">
				<h2 className="text-lg font-semibold">2 · The gateway in your API</h2>
				<Code>{`app.route('/api/agent', createAgentGateway({
  agent: (c) => c.env.AGENT,            // service binding
  identify: (c) => ({ tenant, person, role, name }),
  preflight: async (c, caller) => budgetLeft(caller)
    ? { ok: true, model: tenantModel(caller) }
    : { ok: false, status: 429, reason: 'budget', message: 'Monthly AI budget reached.' },
}));`}</Code>
			</section>
			<section className="grid gap-3">
				<h2 className="text-lg font-semibold">3 · The React UI</h2>
				<Code>{`<AgentProvider person={me.id} personName={me.name} strings={ptBR}
               toolLabels={{ my_tool: ['Looking…', 'Looked'] }}>
  <App />
  <ChatBox onExpand={() => navigate('/assistant')} />
</AgentProvider>

// on the /assistant route
<AssistantScreen />`}</Code>
			</section>
			<p className="text-sm text-muted-foreground">Code and template: <code className="rounded bg-muted px-1">rubrion/agent-kit</code>. Copy <code className="rounded bg-muted px-1">template/</code> to start a new project.</p>
		</article>
	);
}
