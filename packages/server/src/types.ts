// Shared shapes of the server side: who is asking, which model answers, and how
// an agent is declared.

/**
 * Who is asking. The gateway resolves it from the app's own session and sends it
 * to the agent worker in headers; the agent worker trusts it because it is only
 * reachable through a service binding.
 */
export interface Caller {
	/** The account, office, workspace… everything this person's data lives under. */
	tenant: string;
	/** The person inside the tenant. Conversations are private to tenant + person. */
	person: string;
	/** Free-form role, available to tools and context (e.g. to hide financial data). */
	role: string;
	/** Display name, given to the agent so it can address the person. */
	name: string;
}

export type Provider = 'workers-ai' | 'anthropic' | 'openai';

/** The model that answers a request. `key` exists only for bring-your-own-key providers. */
export interface ModelChoice {
	provider: Provider;
	model: string;
	key?: string;
}

/** Dollars per million tokens. */
export interface Price {
	input: number;
	output: number;
}

/**
 * One agent the assistant offers. Each becomes a Mastra Agent, built once per
 * isolate; the model is resolved per request (the tenant may bring its own key).
 */
export interface AgentDefinition {
	id: string;
	name: string;
	/** One line for the agent picker. */
	tagline: string;
	/** Reasoning on (Workers AI): slower and pricier, and the UI shows the thinking. */
	thinking?: boolean;
	/** Mastra tools (createTool). Prefer small read-only tools that return facts. */
	tools: Record<string, unknown>;
	/** Output cap on Workers AI. External models get more room, since their thinking counts as output. */
	maxOutputTokens?: number;
	instructions: string;
}

/** What one answer cost, reported when the stream ends. */
export interface Usage {
	caller: Caller;
	agent: string;
	thread: string;
	provider: Provider;
	model: string;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	status: 'ok' | 'error';
	error?: string;
}

/** A stream event as the browser receives it (`data: {json}` lines, then `data: [DONE]`). */
export type StreamEvent =
	| { type: 'text-delta' | 'reasoning-delta'; text: string }
	| { type: 'reasoning-start' | 'reasoning-end' | 'text-start' | 'text-end' | 'step-start' | 'step-finish' | 'finish' }
	| { type: 'tool-start'; id: string; name: string }
	| { type: 'tool-call'; id: string; name: string; args: unknown }
	| { type: 'tool-result'; id: string; name: string; result: unknown; error: boolean }
	| { type: 'error'; message: string };
