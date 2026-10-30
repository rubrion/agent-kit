import { describe, expect, it } from 'vitest';
import { readCaller, writeCaller } from './headers.js';
import { readModelChoice, priceOf, DEFAULT_MODEL } from './models.js';
import { defaultErrorMessage, slim, usageOf } from './stream.js';
import { toTurns } from './turns.js';

describe('slim', () => {
	it('keeps what the UI draws and drops the rest', () => {
		expect(slim({ type: 'text-delta', payload: { text: 'hi' } })).toEqual({ type: 'text-delta', text: 'hi' });
		expect(slim({ type: 'tool-call', payload: { toolCallId: 'a', toolName: 't', args: { x: 1 } } })).toEqual({ type: 'tool-call', id: 'a', name: 't', args: { x: 1 } });
		expect(slim({ type: 'tool-error', payload: { toolCallId: 'a', toolName: 't' } })).toEqual({ type: 'tool-result', id: 'a', name: 't', result: null, error: true });
		expect(slim({ type: 'step-output', payload: { prompt: 'secret' } })).toBeNull();
		expect(slim(null)).toBeNull();
	});
	it('maps provider errors', () => {
		expect(slim({ type: 'error', payload: { error: new Error('401 Unauthorized') } }, defaultErrorMessage)).toEqual({ type: 'error', message: defaultErrorMessage('401') });
	});
});

describe('usageOf', () => {
	it('reads either usage shape', () => {
		expect(usageOf({ payload: { output: { usage: { inputTokens: 3, outputTokens: 4 } } } })).toEqual({ input: 3, output: 4 });
		expect(usageOf({ payload: { totalUsage: { promptTokens: 1, completionTokens: 2 } } })).toEqual({ input: 1, output: 2 });
		expect(usageOf({})).toEqual({ input: 0, output: 0 });
	});
});

describe('headers', () => {
	it('round-trips a caller and rejects unsafe ids', () => {
		const h = new Headers();
		writeCaller(h, { tenant: '7', person: 'ana@x.com', role: 'owner', name: 'Ana Lúcia' });
		expect(readCaller(h)).toEqual({ tenant: '7', person: 'ana@x.com', role: 'owner', name: 'Ana Lúcia' });
		h.set('X-Agent-Tenant', '../7');
		expect(readCaller(h)).toBeNull();
	});
});

describe('model choice', () => {
	it('falls back to Workers AI on anything malformed', () => {
		expect(readModelChoice('nope').model).toBe(DEFAULT_MODEL);
		expect(readModelChoice(JSON.stringify({ provider: 'anthropic', model: 'claude-haiku-5-5' })).provider).toBe('workers-ai');
		expect(readModelChoice(JSON.stringify({ provider: 'openai', model: 'gpt-4o', key: 'k' }))).toEqual({ provider: 'openai', model: 'gpt-4o', key: 'k' });
		expect(priceOf({ provider: 'anthropic', model: 'unknown' }).input).toBe(2);
	});
});

describe('toTurns', () => {
	it('merges an answer stored across messages', () => {
		const turns = toTurns([
			{ role: 'user', content: { parts: [{ type: 'text', text: 'oi' }] } },
			{ role: 'assistant', content: { parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: 'a', toolName: 't', args: {}, result: 1 } }] } },
			{ role: 'assistant', content: { parts: [{ type: 'text', text: 'pronto' }] } },
		], 'main');
		expect(turns).toHaveLength(2);
		expect(turns[1].steps.map((s: { kind: string }) => s.kind)).toEqual(['tool', 'text']);
	});
});
