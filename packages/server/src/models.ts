// Which model answers each request. Workers AI is the default (no key, billed to
// the account running the worker); a tenant may bring its own Anthropic or OpenAI
// key, which the gateway sends in X-Agent-Model and only lives in that request.
import { workersAI, type AiBinding, type Model } from '@rubrion/mastra-cloudflare';
import type { ModelChoice, Price, Provider } from './types.js';

export const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

/** Dollars per million tokens, used to report the cost of each answer. Extend through options.prices. */
export const PRICES: Record<string, Price> = {
	[DEFAULT_MODEL]: { input: 0.1, output: 0.3 },
	'claude-haiku-5-5': { input: 0.1, output: 0.5 },
	'claude-sonnet-5-5': { input: 2, output: 10 },
	'claude-opus-5-5': { input: 4, output: 20 },
	'gpt-4o-mini': { input: 0.15, output: 0.6 },
	'gpt-4o': { input: 2.5, output: 10 },
};

/** Used when a model is not in the table. */
const PROVIDER_PRICE: Record<Provider, Price> = {
	'workers-ai': PRICES[DEFAULT_MODEL],
	anthropic: PRICES['claude-sonnet-5-5'],
	openai: PRICES['gpt-4o'],
};

/** The choice in the header; anything malformed becomes the default Workers AI model. */
export function readModelChoice(header: string | null | undefined, fallback: ModelChoice = { provider: 'workers-ai', model: DEFAULT_MODEL }): ModelChoice {
	try {
		const c = JSON.parse(header ?? '') as Partial<ModelChoice>;
		if ((c.provider === 'anthropic' || c.provider === 'openai') && typeof c.model === 'string' && c.model && typeof c.key === 'string' && c.key) {
			return { provider: c.provider, model: c.model, key: c.key };
		}
		if (c.provider === 'workers-ai' && typeof c.model === 'string' && c.model.startsWith('@cf/')) return { provider: 'workers-ai', model: c.model };
	} catch { /* no header */ }
	return fallback;
}

export const priceOf = (choice: ModelChoice, prices: Record<string, Price> = PRICES) => prices[choice.model] ?? PROVIDER_PRICE[choice.provider];

/** Only Workers AI takes temperature and the thinking switch; the others decide on their own. */
export const isWorkersAI = (choice: ModelChoice) => choice.provider === 'workers-ai';

/**
 * Bring-your-own-key providers, opt-in so their SDKs only enter the bundle of
 * apps that offer them:
 *
 *     providers: { anthropic: () => import('@ai-sdk/anthropic'), openai: () => import('@ai-sdk/openai') }
 */
export interface Providers {
	anthropic?: () => Promise<{ createAnthropic: (o: { apiKey?: string }) => (model: string) => unknown }>;
	openai?: () => Promise<{ createOpenAI: (o: { apiKey?: string }) => { chat: (model: string) => unknown } }>;
}

/** The AI SDK model for a choice. A provider not enabled falls back to Workers AI. */
export async function resolveModel(choice: ModelChoice, ai: AiBinding, thinking: boolean, providers: Providers = {}): Promise<Model> {
	if (choice.provider === 'anthropic' && providers.anthropic) {
		const { createAnthropic } = await providers.anthropic();
		return createAnthropic({ apiKey: choice.key })(choice.model) as Model;
	}
	if (choice.provider === 'openai' && providers.openai) {
		const { createOpenAI } = await providers.openai();
		return createOpenAI({ apiKey: choice.key }).chat(choice.model) as Model;
	}
	return workersAI(ai, isWorkersAI(choice) ? choice.model : DEFAULT_MODEL, { thinking });
}
