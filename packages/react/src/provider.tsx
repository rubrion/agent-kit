// The conversation, kept above the router. Two places show it (the chat box in
// the corner of every screen and the full assistant screen), so asking in one and
// expanding finds the same conversation, even with the answer still arriving.
//
// The UI sends only the new question: the agent's memory recalls the thread,
// which lives on the server. This browser only remembers which thread was open.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyEvent, phaseOf, readEvents, type AgentInfo, type AssistantTurn, type Phase, type Session, type Status, type Turn } from './events.js';
import { en, type Strings } from './strings.js';

export interface AgentConfig {
	/** Where the gateway is mounted. Default '/api/agent'. */
	basePath?: string;
	/** Extra headers on every call (e.g. the tenant the app is showing). */
	headers?: () => HeadersInit;
	/** Whose conversations: the remembered open thread is per person. */
	person: string;
	/** The signed-in person's display name (greeting). */
	personName?: string;
	/** Prefix for browser storage keys. Default 'agent'. */
	storageKey?: string;
	/** The agent picked when nothing is remembered. Default: the first the gateway lists. */
	defaultAgent?: string;
	strings?: Partial<Strings>;
	/** Labels per tool name: [while running, when done]. Unknown tools show their name. */
	toolLabels?: Record<string, [string, string]>;
	/** Which argument of a tool call to show next to its label (default: the first string argument). */
	toolSubject?: (name: string, args: Record<string, unknown> | undefined) => string | undefined;
	/** Starter questions on an empty conversation. */
	suggestions?: string[];
	/** Server messages shown as is (they tell the person what to do); others become strings.failed. */
	actionableError?: (message: string) => boolean;
	/** Asked before deleting a conversation. Default window.confirm. */
	confirmDelete?: (session: Session) => boolean | Promise<boolean>;
	/** Replaces the default mascot everywhere. */
	renderMascot?: (props: { phase: Phase; size: number; jumping?: boolean }) => ReactNode;
	/** Shown instead of the conversation when the preflight blocks (missing key, budget…). */
	renderBlocked?: (status: Status) => ReactNode;
}

export interface Conversation {
	config: Required<Pick<AgentConfig, 'basePath' | 'storageKey'>> & AgentConfig;
	t: Strings;
	turns: Turn[];
	busy: boolean;
	phase: Phase;
	agents: AgentInfo[];
	/** null while loading; false when the assistant is offline. */
	available: boolean | null;
	/** null while checking. */
	status: Status | null;
	agent: string;
	thread: string;
	sessions: Session[];
	error: string | null;
	/** The chat box opened or the assistant screen shown: only then the agent is called (other screens pay nothing). */
	activate: () => void;
	send: (question: string) => void;
	stop: () => void;
	/** Starts another; an answer on its way is interrupted. */
	newConversation: () => void;
	/** Each conversation belongs to one agent: switching opens a new one. */
	chooseAgent: (id: string) => void;
	open: (s: Session) => Promise<void>;
	remove: (s: Session) => Promise<void>;
}

const Context = createContext<Conversation | null>(null);

export function useAgent(): Conversation {
	const c = useContext(Context);
	if (!c) throw new Error('useAgent outside <AgentProvider>');
	return c;
}

const newId = () => Math.random().toString(36).slice(2, 12);

function remembered(key: string): { thread: string; agent: string } | null {
	try {
		const v = JSON.parse(localStorage.getItem(key) || 'null');
		return v && typeof v.thread === 'string' && /^[a-z0-9]{6,32}$/i.test(v.thread) ? { thread: v.thread, agent: String(v.agent || '') } : null;
	} catch {
		return null; // private window or blocked storage: no memory of the last one
	}
}

async function json<T>(r: Response): Promise<T> {
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error((data as { error?: string }).error || `The assistant did not answer (error ${r.status}).`);
	return data as T;
}

export function AgentProvider({ children, ...config }: AgentConfig & { children: ReactNode }) {
	const basePath = config.basePath ?? '/api/agent';
	const storageKey = config.storageKey ?? 'agent';
	const t = useMemo(() => ({ ...en, ...config.strings }), [config.strings]);
	const key = `${storageKey}_conversation_${config.person}`;
	const headers = useCallback((extra?: HeadersInit) => ({ ...(config.headers?.() as Record<string, string> | undefined), ...(extra as Record<string, string> | undefined) }), [config.headers]);

	const initial = useRef(remembered(key));
	const [agent, setAgent] = useState(initial.current?.agent || config.defaultAgent || '');
	const [thread, setThread] = useState(initial.current?.thread ?? newId());
	const [turns, setTurns] = useState<Turn[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [active, setActive] = useState(false);
	const [agents, setAgents] = useState<{ data: AgentInfo[]; state: 'idle' | 'loading' | 'ok' | 'error'; error?: string }>({ data: [], state: 'idle' });
	const [status, setStatus] = useState<Status | null>(null);
	const [sessions, setSessions] = useState<Session[]>([]);
	const control = useRef<AbortController | null>(null);
	const activate = useCallback(() => setActive(true), []);

	const loadSessions = useCallback(async () => {
		try { setSessions((await json<Session[]>(await fetch(`${basePath}/threads`, { headers: headers() }))).filter((s) => s.id)); } catch { /* keeps the old list */ }
	}, [basePath, headers]);

	const loadStatus = useCallback(async () => {
		try { setStatus(await json<Status>(await fetch(`${basePath}/status`, { headers: headers() }))); } catch { setStatus(null); }
	}, [basePath, headers]);

	useEffect(() => {
		if (!active || agents.state !== 'idle') return;
		setAgents({ data: [], state: 'loading' });
		fetch(`${basePath}/agents`, { headers: headers() })
			.then((r) => json<AgentInfo[]>(r))
			.then((list) => {
				setAgents({ data: list, state: 'ok' });
				setAgent((a) => (list.some((x) => x.id === a) ? a : list[0]?.id ?? a));
				loadSessions();
			})
			.catch((e: Error) => setAgents({ data: [], state: 'error', error: e.message }));
		loadStatus();
	}, [active, agents.state, basePath, headers, loadSessions, loadStatus]);

	// the key may have been set in another tab: check again on return
	useEffect(() => {
		if (!active) return;
		const onFocus = () => loadStatus();
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	}, [active, loadStatus]);

	// the conversation open last time comes back after a reload
	useEffect(() => {
		try { localStorage.setItem(key, JSON.stringify({ thread, agent })); } catch { /* this tab only */ }
	}, [thread, agent, key]);
	useEffect(() => {
		const last = initial.current;
		if (!last || !active) return;
		initial.current = null;
		fetch(`${basePath}/threads/${last.thread}?agent=${encodeURIComponent(last.agent)}`, { headers: headers() })
			.then((r) => (r.ok ? (r.json() as Promise<Turn[]>) : []))
			.then((tt) => setTurns((cur) => (cur.length ? cur : Array.isArray(tt) ? tt : [])))
			.catch(() => undefined);
	}, [active, basePath, headers]);
	useEffect(() => () => control.current?.abort(), []);

	const send = useCallback(async (question: string) => {
		const q = question.trim();
		if (!q || busy) return;
		setError(null);
		const answer: AssistantTurn = { id: newId(), role: 'assistant', agent, steps: [], done: false };
		setTurns((tt) => [...tt, { id: newId(), role: 'user', text: q }, answer]);
		setBusy(true);
		const ctrl = new AbortController();
		control.current = ctrl;
		const change = (f: (t: AssistantTurn) => AssistantTurn) =>
			setTurns((all) => all.map((x) => (x.id === answer.id && x.role === 'assistant' ? f(x) : x)));
		const opts = { fallbackError: t.failed, actionable: config.actionableError };
		try {
			const r = await fetch(`${basePath}/stream`, {
				method: 'POST',
				headers: headers({ 'content-type': 'application/json' }),
				signal: ctrl.signal,
				body: JSON.stringify({ agent, thread, message: q }),
			});
			if (!r.ok || !r.body) {
				const j = (await r.json().catch(() => ({}))) as { error?: string; reason?: string };
				change((x) => ({ ...x, error: j.error || t.failed }));
				// blocked since it opened (key removed, budget reached): the notice takes over
				if (j.reason) loadStatus();
				return;
			}
			await readEvents(r.body, (ev) => change((x) => applyEvent(x, ev, opts)));
		} catch (e) {
			if ((e as Error).name !== 'AbortError') change((x) => ({ ...x, error: t.connectionLost }));
		} finally {
			change((x) => ({ ...x, done: true }));
			setBusy(false);
			control.current = null;
			loadSessions();
		}
	}, [agent, basePath, busy, config.actionableError, headers, loadSessions, loadStatus, t, thread]);

	const stop = useCallback(() => control.current?.abort(), []);

	const newConversation = useCallback(() => {
		control.current?.abort();
		setThread(newId());
		setTurns([]);
		setError(null);
	}, []);

	const chooseAgent = useCallback((id: string) => {
		if (id === agent) return;
		setAgent(id);
		newConversation();
	}, [agent, newConversation]);

	const open = useCallback(async (s: Session) => {
		if (busy || (s.id === thread && s.agent === agent)) return;
		try {
			const tt = await json<Turn[]>(await fetch(`${basePath}/threads/${s.id}?agent=${encodeURIComponent(s.agent)}`, { headers: headers() }));
			setAgent(s.agent);
			setThread(s.id);
			setTurns(tt);
			setError(null);
		} catch (e) {
			setError((e as Error).message);
		}
	}, [agent, basePath, busy, headers, thread]);

	const remove = useCallback(async (s: Session) => {
		const ok = await (config.confirmDelete ?? ((x: Session) => window.confirm(t.confirmDelete(x.title))))(s);
		if (!ok) return;
		await fetch(`${basePath}/threads/${s.id}`, { method: 'DELETE', headers: headers() }).catch(() => undefined);
		if (s.id === thread) newConversation();
		await loadSessions();
	}, [basePath, config.confirmDelete, headers, loadSessions, newConversation, t, thread]);

	const last = turns[turns.length - 1];
	const value: Conversation = {
		config: { ...config, basePath, storageKey },
		t,
		turns, busy, phase: phaseOf(last, busy),
		agents: agents.data,
		available: !active || agents.state === 'idle' || agents.state === 'loading' ? null : agents.state === 'ok',
		status, agent, thread, sessions,
		error: error ?? (agents.state === 'error' ? agents.error ?? null : null),
		activate, send, stop, newConversation, chooseAgent, open, remove,
	};
	return <Context.Provider value={value}>{children}</Context.Provider>;
}
