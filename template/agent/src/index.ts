// The agent worker. Everything specific to an app is here: the agents, their
// tools, the context sent with each question, and what to do with the cost.
import { createAgentWorker } from '@rubrion/agent-kit-server';
import { AGENTS } from './agents';

interface Env {
	AI: Ai;
	MEMORY: D1Database;
}

export default createAgentWorker<Env>({
	agents: AGENTS,
	ai: (env) => env.AI,
	memory: (env) => env.MEMORY,
	// A snapshot of what exists goes with every question, so the agent knows the
	// ground before calling tools. Here: just the date; in a real app, the
	// projects, the team… (keep it short: it is paid on every turn).
	context: () => `Today is ${new Date().toISOString().slice(0, 10)} (UTC).`,
	// Log, bill, or enforce a monthly cap (write to the app's D1 and check it in the gateway preflight).
	onUsage: (u) => console.log(JSON.stringify({ event: 'agent-usage', tenant: u.caller.tenant, person: u.caller.person, agent: u.agent, model: u.model, tokens: u.inputTokens + u.outputTokens, usd: u.costUsd, status: u.status })),
});
