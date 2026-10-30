# agent-kit

An AI assistant you can drop into any Cloudflare app: Mastra agents on a Worker
with D1 memory, a gateway in your app's API, and a React chat UI that streams the
agent's thinking, tool calls and answer. Extracted from the Cerne assistant.

Live demo (Rubrion team, Cloudflare Access): https://agent-kit.rubrion.ai

```
browser ──► app Worker /api/agent/*  (gateway: who is asking? may they ask?)
                 │ service binding, X-Agent-* headers
                 ▼
            agent Worker  (Mastra agents + tools, D1 memory, slim SSE)  ── no public route
```

| Package | What it is |
|---|---|
| [`@rubrion/agent-kit-server`](packages/server) | `createAgentWorker` (the agent Worker) and, from `@rubrion/agent-kit-server/gateway`, `createAgentGateway` (Hono routes for your API, no Mastra in its bundle) |
| [`@rubrion/agent-kit-react`](packages/react) | `AgentProvider`, `ChatBox` (floating, non-modal, on every screen), `AssistantScreen` (full page with agent picker and conversations), and the pieces they are made of |
| [`template/`](template) | A working app with both: `template/agent` (the agent Worker) and `template/web` (Vite + React + Tailwind, the Worker serving it with the gateway behind Cloudflare Access). This is what runs at agent-kit.rubrion.ai |

## Start a new project from the template

```bash
cp -r agent-kit/template my-app && cd my-app
# in agent/package.json and web/package.json, change "*" to the published versions
# (or keep the template inside this repo's workspaces while the packages are unpublished)
```

1. **Agents and tools.** Edit `agent/src/agents.ts` and `agent/src/tools.ts`.
2. **Memory.** `wrangler d1 create my-app-agent-memory` and put the id in `agent/wrangler.jsonc`.
3. **Identity.** In `web/src/worker/index.ts`, `who()` turns the session into a `Caller`
   `{ tenant, person, role, name }`. The template reads Cloudflare Access and verifies its JWT
   (`web/src/worker/access.ts`); a real app uses its own login.
4. **Names.** Worker names, `account_id`, custom domain and the Access `ACCESS_TEAM_DOMAIN` /
   `ACCESS_AUD` in both `wrangler.jsonc`.
5. **Run.** `npm run dev` (root): Vite runs both Workers; set `DEV_USER=you@x.com` in
   `web/.dev.vars` to skip Access locally. Workers AI always runs remote, so be logged in to wrangler.
6. **Deploy.** `npm run deploy -w template/agent`, then `npm run deploy -w template/web`.

## Adding it to an existing app

**1. The agent Worker** (a new Worker, no route):

```ts
import { createAgentWorker } from '@rubrion/agent-kit-server';

export default createAgentWorker<Env>({
  agents: [{ id: 'main', name: 'Assistant', tagline: 'Everyday questions', tools, instructions }],
  ai: (env) => env.AI,
  memory: (env) => env.MEMORY,                       // D1; tables created on first use
  context: ({ caller }) => snapshot(caller.tenant),  // appended to the instructions on every question
  scope: ({ caller, env }, next) => tenant.run(caller.tenant, next), // tools read the tenant from here
  onUsage: (u, env) => logCost(env, u),              // tokens and USD per answer
  providers: { anthropic: () => import('@ai-sdk/anthropic') },      // optional bring-your-own-key
});
```

`wrangler.jsonc` needs `"compatibility_flags": ["nodejs_compat", "new_module_registry"]`, an `ai`
binding, a D1 binding, and `"workers_dev": false` (only the gateway may call it).

**2. The gateway** in your API Worker, with a service binding `AGENT` to the agent Worker:

```ts
import { createAgentGateway } from '@rubrion/agent-kit-server/gateway';

app.route('/api/agent', createAgentGateway({
  agent: (c) => c.env.AGENT,
  identify: (c) => ({ tenant: String(c.get('officeId')), person: String(c.get('userId')), role: c.get('role'), name: c.get('name') }),
  preflight: async (c, caller) => {
    if (await overBudget(c, caller)) return { ok: false, status: 429, reason: 'budget', message: 'Monthly AI budget reached.' };
    return { ok: true, model: await tenantModel(c, caller) }; // e.g. { provider: 'anthropic', model, key }
  },
  canUse: (c, caller, agentId) => agentId !== 'deep' || planHasDeep(c) || { status: 403, reason: 'plan', message: 'Upgrade to use this agent.' },
}));
```

**3. The UI**, above the router:

```tsx
import { AgentProvider, AssistantScreen, ChatBox, ptBR } from '@rubrion/agent-kit-react';
import '@rubrion/agent-kit-react/styles.css';

<AgentProvider person={me.id} personName={me.name} strings={ptBR}
  toolLabels={{ list_projects: ['Consultando os projetos', 'Consultou os projetos'] }}
  suggestions={['O que vence esta semana?']}
  actionableError={(m) => m.includes('Configurações')}
  renderMascot={({ phase, size }) => <MyMascot phase={phase} size={size} />}
  renderBlocked={(status) => <SetupNotice status={status} />}>
  <Router />
  <ChatBox onExpand={() => navigate('/assistant')} hidden={path === '/assistant'} />
</AgentProvider>

// on /assistant
<AssistantScreen panelSide="right" />
```

The components use the shadcn/ui tokens (`bg-card`, `text-muted-foreground`, `ring-ring`…), so
they match a shadcn app. Tailwind must scan the package; in your CSS:

```css
@source "../node_modules/@rubrion/agent-kit-react/dist";
```

On a site without Tailwind's preflight, import only `tailwindcss/theme` and
`tailwindcss/utilities`, limit `@source` to the package, and define the tokens: the kit's roots
(`.ak`) reset their own elements, so the rest of the page keeps its styles.

## How it behaves

- **The browser sends only the new question.** Mastra Memory recalls the thread (last 8 messages
  by default); the browser remembers only which thread was open.
- **Conversations are private** to tenant + person, one agent each; up to 50 per person.
- **Steps stream as they happen:** reasoning (folded after), one card per tool call (args and
  result inside), then the text. The mascot follows: idle, thinking, using a tool, speaking.
- **Slim SSE.** Only what the UI draws leaves the agent Worker; prompts and step outputs never do.
- **Nothing runs until used.** The provider only calls the gateway once the chat box opens or the
  assistant screen shows.
- **Blocked states** come from the gateway preflight (`/status`) and replace the conversation.

## Writing good tools

- Small, read-only, one kind of question each. Return **facts already computed** (dates,
  totals, "overdue by 3 days") so the model never does math.
- Missing data is explicit: `{ found: false, reason }`, so the agent asks instead of inventing.
- Resolve names to ids in one search tool; the others take ids. When the search finds none or
  several, the agent asks which one.
- To change data, return a **draft** (never write): the UI shows a card with a link, the person
  confirms, and the app's normal API saves it.
- Scope every query by `caller.tenant` (the `scope` option) and test that tenant B never sees A.

## Develop

```bash
npm install
npm run build   # both packages
npm test        # unit tests (stream events, headers, models, turns, UI reducer)
npm run dev     # the template with both Workers
```

A Mastra agent Worker bundles to about 9 MB (2.3 MB gzip). If `wrangler deploy` drops the upload on
a flaky connection, `wrangler deploy --dry-run --outdir out` and upload `out/` with the Workers API
over HTTP/1.1.

## License

MIT
