// Mastra's full stream, reduced to what a chat UI draws. Requests and whole step
// outputs (which carry the full prompt) never leave the worker.
import type { StreamEvent } from './types.js';

export function slim(chunk: unknown, errorMessage: (raw: string) => string = (m) => m): StreamEvent | null {
	if (!chunk || typeof chunk !== 'object') return null;
	const { type, payload = {} } = chunk as { type: string; payload?: Record<string, unknown> };
	switch (type) {
		case 'text-delta':
		case 'reasoning-delta':
			return { type, text: String(payload.text ?? '') };
		case 'reasoning-start':
		case 'reasoning-end':
		case 'text-start':
		case 'text-end':
		case 'step-start':
		case 'step-finish':
		case 'finish':
			return { type };
		case 'tool-call-input-streaming-start':
			return { type: 'tool-start', id: String(payload.toolCallId), name: String(payload.toolName) };
		case 'tool-call':
			return { type: 'tool-call', id: String(payload.toolCallId), name: String(payload.toolName), args: payload.args };
		case 'tool-result':
			return { type: 'tool-result', id: String(payload.toolCallId), name: String(payload.toolName), result: payload.result, error: Boolean(payload.isError) };
		case 'tool-error':
			return { type: 'tool-result', id: String(payload.toolCallId), name: String(payload.toolName), result: null, error: true };
		case 'error':
			return { type: 'error', message: errorMessage(String((payload.error as Error)?.message ?? payload.error ?? 'error')) };
		default:
			return null;
	}
}

/** Token usage reported by a step-finish or finish chunk. */
export function usageOf(chunk: unknown) {
	const p = ((chunk as { payload?: Record<string, unknown> }).payload ?? {}) as Record<string, any>;
	const u = p.output?.usage ?? p.totalUsage ?? p.usage ?? {};
	return { input: Number(u.inputTokens ?? u.promptTokens ?? 0), output: Number(u.outputTokens ?? u.completionTokens ?? 0) };
}

/** Provider errors the person can act on; the rest pass through. */
export function defaultErrorMessage(m: string) {
	if (/\b401\b|unauthori[sz]ed|invalid.{0,20}(api.?key|x-api-key)|authentication|incorrect api key/i.test(m)) {
		return 'The AI provider rejected the access key. Check the key in the AI settings.';
	}
	if (/\b429\b|rate.?limit|quota|credit balance/i.test(m)) {
		return 'The AI provider refused because of a rate limit or account credit. Check the provider account.';
	}
	return m;
}

export const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
export const SSE_DONE = 'data: [DONE]\n\n';
