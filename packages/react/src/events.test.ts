import { describe, expect, it } from 'vitest';
import { applyEvent, phaseOf, readEvents, type AssistantTurn } from './events.js';

const blank = (): AssistantTurn => ({ id: 'a', role: 'assistant', agent: 'main', steps: [], done: false });
const opts = { now: 1000, fallbackError: 'failed' };

describe('applyEvent', () => {
	it('builds thinking, a tool card and text in order', () => {
		let t = blank();
		t = applyEvent(t, { type: 'reasoning-delta', text: 'hm' }, opts);
		t = applyEvent(t, { type: 'reasoning-delta', text: 'm' }, opts);
		t = applyEvent(t, { type: 'tool-start', id: 'x', name: 'today' }, { ...opts, now: 2000 });
		t = applyEvent(t, { type: 'tool-call', id: 'x', name: 'today', args: { a: 1 } }, opts);
		t = applyEvent(t, { type: 'tool-result', id: 'x', name: 'today', result: { date: '2026-10-30' }, error: false }, { ...opts, now: 3000 });
		t = applyEvent(t, { type: 'text-delta', text: 'Hoje ' }, opts);
		t = applyEvent(t, { type: 'text-delta', text: 'é 30.' }, opts);
		expect(t.steps).toEqual([
			{ kind: 'think', text: 'hmm', start: 1000, end: 2000 },
			{ kind: 'tool', id: 'x', name: 'today', args: { a: 1 }, result: { date: '2026-10-30' }, state: 'done', start: 2000, end: 3000 },
			{ kind: 'text', text: 'Hoje é 30.' },
		]);
	});
	it('marks a tool whose result reports an error', () => {
		let t = applyEvent(blank(), { type: 'tool-call', id: 'x', name: 't' }, opts);
		t = applyEvent(t, { type: 'tool-result', id: 'x', name: 't', result: { error: 'no' }, error: false }, opts);
		expect(t.steps[0]).toMatchObject({ state: 'error' });
	});
	it('shows server errors only when actionable', () => {
		expect(applyEvent(blank(), { type: 'error', message: 'stack trace' }, opts).error).toBe('failed');
		expect(applyEvent(blank(), { type: 'error', message: 'Check the key in Settings' }, { ...opts, actionable: (m) => m.includes('Settings') }).error).toBe('Check the key in Settings');
	});
});

describe('phaseOf', () => {
	it('follows the last step', () => {
		expect(phaseOf(undefined, false)).toBe('idle');
		expect(phaseOf(blank(), true)).toBe('thinking');
		expect(phaseOf({ ...blank(), steps: [{ kind: 'tool', id: 'x', name: 't', state: 'running', start: 0 }] }, true)).toBe('tool');
		expect(phaseOf({ ...blank(), steps: [{ kind: 'text', text: 'a' }] }, true)).toBe('speaking');
	});
});

describe('readEvents', () => {
	it('parses frames split across chunks and stops at [DONE]', async () => {
		const enc = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(enc.encode('data: {"type":"text-delta","te'));
				c.enqueue(enc.encode('xt":"oi"}\n\ndata: garbage\n\n'));
				c.enqueue(enc.encode('data: [DONE]\n\n'));
				c.close();
			},
		});
		const got: unknown[] = [];
		await readEvents(body, (e) => got.push(e));
		expect(got).toEqual([{ type: 'text-delta', text: 'oi' }]);
	});
});
