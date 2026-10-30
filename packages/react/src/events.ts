// The conversation model and the pure reducer that applies stream events to an
// answer being written. No React here: it is unit-tested on its own.

export type Step =
	| { kind: 'think'; text: string; start: number; end?: number }
	| { kind: 'tool'; id: string; name: string; args?: unknown; result?: unknown; state: 'running' | 'done' | 'error'; start: number; end?: number }
	| { kind: 'text'; text: string };

export type UserTurn = { id: string; role: 'user'; text: string };
export type AssistantTurn = { id: string; role: 'assistant'; agent: string; steps: Step[]; error?: string; done: boolean };
export type Turn = UserTurn | AssistantTurn;

export type Session = { id: string; agent: string; title: string; updatedAt: string };
export type AgentInfo = { id: string; name: string; tagline: string; thinking: boolean };
/** What the mascot does: waits, thinks, uses a tool, writes. */
export type Phase = 'idle' | 'thinking' | 'tool' | 'speaking';
/** Whether the assistant may answer now; otherwise the reason and the message (from the gateway preflight). */
export type Status = { ready: boolean; reason: string | null; message: string | null };

export type StreamEvent = { type: string; [k: string]: any };

/** The phase of the answer being written, for the mascot. */
export function phaseOf(turn: Turn | undefined, busy: boolean): Phase {
	if (!busy) return 'idle';
	if (!turn || turn.role !== 'assistant') return 'thinking';
	const last = turn.steps[turn.steps.length - 1];
	if (!last || last.kind === 'think') return 'thinking';
	if (last.kind === 'tool') return last.state === 'running' ? 'tool' : 'thinking';
	return 'speaking';
}

/**
 * Applies one stream event to the answer being written. `actionable(message)`
 * says whether a server error message tells the person what to do (shown as is);
 * otherwise `fallbackError` is shown.
 */
export function applyEvent(turn: AssistantTurn, ev: StreamEvent, opts: { now?: number; fallbackError: string; actionable?: (m: string) => boolean }): AssistantTurn {
	const steps = [...turn.steps];
	const last = steps[steps.length - 1];
	const now = opts.now ?? Date.now();
	const closeThinking = () => {
		for (let i = steps.length - 1; i >= 0; i--) {
			const s = steps[i];
			if (s.kind === 'think' && s.end === undefined) { steps[i] = { ...s, end: now }; break; }
		}
	};
	switch (ev.type) {
		case 'reasoning-delta':
			if (last?.kind === 'think' && last.end === undefined) steps[steps.length - 1] = { ...last, text: last.text + ev.text };
			else steps.push({ kind: 'think', text: String(ev.text ?? ''), start: now });
			break;
		case 'reasoning-end':
			closeThinking();
			break;
		case 'tool-start':
		case 'tool-call': {
			closeThinking();
			const i = steps.findIndex((s) => s.kind === 'tool' && s.id === ev.id);
			if (i >= 0) {
				const s = steps[i] as Extract<Step, { kind: 'tool' }>;
				steps[i] = { ...s, args: ev.args ?? s.args };
			} else steps.push({ kind: 'tool', id: ev.id, name: ev.name, args: ev.args, state: 'running', start: now });
			break;
		}
		case 'tool-result': {
			const i = steps.findIndex((s) => s.kind === 'tool' && s.id === ev.id);
			const failed = Boolean(ev.error) || Boolean(ev.result && typeof ev.result === 'object' && ('error' in ev.result || 'erro' in ev.result));
			if (i >= 0) steps[i] = { ...(steps[i] as Extract<Step, { kind: 'tool' }>), result: ev.result, state: failed ? 'error' : 'done', end: now };
			break;
		}
		case 'text-delta':
			closeThinking();
			if (last?.kind === 'text') steps[steps.length - 1] = { ...last, text: last.text + ev.text };
			else steps.push({ kind: 'text', text: String(ev.text ?? '') });
			break;
		case 'error': {
			const m = typeof ev.message === 'string' ? ev.message : '';
			return { ...turn, steps, error: m && opts.actionable?.(m) ? m : opts.fallbackError };
		}
	}
	return { ...turn, steps };
}

/** Reads a `data: {json}` SSE body, calling onEvent per event, until `data: [DONE]` or the end. */
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (ev: StreamEvent) => void) {
	const reader = body.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader();
	let buf = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += value;
		const parts = buf.split(/\r?\n\r?\n/);
		buf = parts.pop() ?? '';
		for (const part of parts) {
			const raw = part.replace(/^data:\s*/, '').trim();
			if (!raw || raw === '[DONE]') continue;
			try { onEvent(JSON.parse(raw)); } catch { /* unreadable frame: skip */ }
		}
	}
}
