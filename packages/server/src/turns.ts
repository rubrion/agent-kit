// Stored Mastra messages, shaped as the UI draws a conversation.
export type StoredMessage = { role: string; content: { parts?: Record<string, any>[]; content?: string } };

/** Stored Mastra messages → turns. One answer may be stored as several messages (a tool step, then the text). */
export function toTurns(messages: StoredMessage[], agent: string) {
	const turns: Record<string, any>[] = [];
	for (const m of messages) {
		const parts = m.content.parts ?? [];
		if (m.role === 'user') {
			const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n') || m.content.content || '';
			if (text) turns.push({ id: crypto.randomUUID(), role: 'user', text });
		} else if (m.role === 'assistant') {
			const steps = parts.flatMap((p): Record<string, unknown>[] =>
				p.type === 'text' && p.text
					? [{ kind: 'text', text: p.text }]
					: p.type === 'reasoning' && (p.reasoning || p.text)
						? [{ kind: 'think', text: p.reasoning ?? p.text, start: 0, end: 0 }]
						: p.type === 'tool-invocation'
							? [{ kind: 'tool', id: p.toolInvocation.toolCallId, name: p.toolInvocation.toolName, args: p.toolInvocation.args, result: p.toolInvocation.result, state: 'done', start: 0, end: 0 }]
							: [],
			);
			const last = turns[turns.length - 1];
			if (last?.role === 'assistant') last.steps.push(...steps);
			else if (steps.length) turns.push({ id: crypto.randomUUID(), role: 'assistant', agent, steps, done: true });
		}
	}
	return turns;
}
