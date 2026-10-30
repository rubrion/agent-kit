import { Check, ChevronDown, MessagesSquare, PanelRightClose, Search, SquarePen, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../events.js';
import { useAgent } from '../provider.js';
import { Availability, Composer, Suggestions, Thread } from './Conversation.js';
import { Avatar, IconButton, cn } from './ui.js';

/**
 * The full assistant screen: the same conversation as the chat box, with room,
 * in the manner of a chat app. Conversations (new, search, earlier ones with any
 * agent) sit on one side; the agent picker on top; the field centered on an empty
 * conversation. On phones the conversation list is a drawer.
 */
export function AssistantScreen({ className, panelSide = 'right', greeting, hint }: {
	className?: string;
	/** Put the conversations opposite the app's own sidebar. */
	panelSide?: 'left' | 'right';
	greeting?: string;
	hint?: string;
}) {
	const { turns, phase, newConversation, config, t } = useAgent();
	const panelKey = `${config.storageKey}_panel`;
	const [drawer, setDrawer] = useState(false);
	// desktop: a column that collapses, remembered; phone: a drawer
	const [panel, setPanel] = useState(() => { try { return localStorage.getItem(panelKey) !== '0'; } catch { return true; } });
	const togglePanel = () => {
		if (!matchMedia('(min-width: 1024px)').matches) { setDrawer(true); return; }
		setPanel((a) => {
			try { localStorage.setItem(panelKey, a ? '0' : '1'); } catch { /* this tab only */ }
			return !a;
		});
	};
	const empty = !turns.length;
	const firstName = (config.personName ?? '').split(' ')[0];

	const aside = (
		<aside aria-label={t.conversations} aria-hidden={!panel} inert={!panel || undefined}
			className={cn('hidden shrink-0 flex-col overflow-hidden bg-muted/30 transition-[width,opacity] duration-300 lg:flex',
				panelSide === 'right' ? 'border-l' : 'border-r', panel ? 'w-72 opacity-100' : 'w-0 border-0 opacity-0')}>
			<div className="flex min-h-0 w-72 flex-1 flex-col"><ConversationList /></div>
		</aside>
	);

	return (
		<div className={cn('ak flex h-full min-h-0', className)}>
			<h1 className="sr-only">{t.assistant}</h1>
			{panelSide === 'left' && aside}
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-center gap-2 px-3 py-2 sm:px-4">
					<AgentPicker />
					<div className="ml-auto flex items-center gap-1.5">
						<IconButton label={t.newConversation} onClick={newConversation}><SquarePen /></IconButton>
						<IconButton label={panel ? t.collapse : t.conversations} onClick={togglePanel} aria-expanded={panel} className={cn(panel && 'lg:bg-accent')}>
							{panel ? <PanelRightClose className="hidden lg:block" /> : null}
							<MessagesSquare className={cn(panel && 'lg:hidden')} />
						</IconButton>
					</div>
				</div>

				<Availability>
					{empty ? (
						<div className="grid flex-1 content-center justify-items-center gap-5 overflow-y-auto px-4 pb-10">
							<Avatar size={112} phase={phase} jumping />
							<div className="ak-rise grid gap-1 text-center">
								<p className="text-2xl font-medium tracking-tight sm:text-3xl">{greeting ?? t.greeting(firstName)}</p>
								<p className="text-sm text-muted-foreground">{hint ?? t.greetingHint}</p>
							</div>
							<Composer className="ak-rise w-full max-w-2xl [animation-delay:60ms]" />
							<Suggestions className="ak-rise max-w-2xl [animation-delay:120ms]" />
						</div>
					) : (
						<>
							<Thread empty={null} />
							<div className="mx-auto w-full max-w-3xl px-4 pt-2 pb-3">
								<Composer />
								<p className="mt-1.5 text-center text-[11px] text-muted-foreground">{t.disclaimer}</p>
							</div>
						</>
					)}
				</Availability>
			</div>
			{panelSide === 'right' && aside}

			{drawer && (
				<div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.conversations} data-state="open"
					onKeyDown={(e) => e.key === 'Escape' && setDrawer(false)}>
					<button type="button" aria-label={t.close} className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
					<div className={cn('absolute inset-y-0 flex w-80 max-w-[85vw] flex-col bg-background shadow-xl', panelSide === 'right' ? 'right-0' : 'left-0')}>
						<ConversationList onPick={() => setDrawer(false)} />
					</div>
				</div>
			)}
		</div>
	);
}

/** The conversation's agent, on top: each conversation belongs to one agent, and switching opens a new one. */
export function AgentPicker() {
	const { agents, agent, chooseAgent, busy, t } = useAgent();
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		document.addEventListener('mousedown', away);
		document.addEventListener('keydown', esc);
		return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
	}, [open]);
	const current = agents.find((a) => a.id === agent);
	if (!agents.length) return null;
	return (
		<div ref={box} className="relative">
			<button type="button" disabled={busy || agents.length < 2} aria-label={t.chooseAgent} aria-expanded={open} onClick={() => setOpen((o) => !o)}
				className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-base font-medium hover:bg-accent disabled:hover:bg-transparent">
				{current?.name ?? t.assistant} {agents.length > 1 && <ChevronDown className="size-4 text-muted-foreground" />}
			</button>
			{open && (
				<ul role="menu" className="ak-rise absolute top-full left-0 z-30 mt-1 grid w-72 gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
					{agents.map((a) => (
						<li key={a.id} role="none">
							<button type="button" role="menuitem" onClick={() => { chooseAgent(a.id); setOpen(false); }}
								className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
								<Avatar size={28} />
								<span className="grid flex-1 gap-0.5">
									<span className="flex items-center gap-1.5 font-medium">
										{a.name}
										{a.thinking && <span className="rounded-full bg-muted px-1.5 text-[10px] font-normal">{t.thinks}</span>}
									</span>
									<span className="text-xs text-muted-foreground">{a.tagline}</span>
								</span>
								{a.id === agent && <Check className="mt-1 size-4 text-primary" />}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const relative = (iso: string, locale: string) => {
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((day(new Date()) - day(new Date(iso))) / 864e5);
	return days < 1
		? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
		: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
};

/** The conversations: new, search by title, and earlier ones (with any agent). */
export function ConversationList({ onPick }: { onPick?: () => void }) {
	const { sessions, agents, thread, agent, busy, newConversation, open, remove, t } = useAgent();
	const [term, setTerm] = useState('');
	const q = term.trim().toLowerCase();
	const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
	const found = sessions.filter((s: Session) => !q || s.title.toLowerCase().includes(q));
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			<button type="button" onClick={() => { newConversation(); onPick?.(); }}
				className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent [&_svg]:size-4"><SquarePen /> {t.newConversation}</button>
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t.searchConversations} aria-label={t.searchConversations}
					className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
			</div>
			<p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.conversations}</p>
			{!sessions.length ? (
				<p className="px-1 text-xs text-muted-foreground">{t.conversationsEmpty}</p>
			) : !found.length ? (
				<p className="px-1 text-xs text-muted-foreground">{t.conversationsNoMatch}</p>
			) : (
				<ul className="-mx-1 grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto">
					{found.map((s) => {
						const current = s.id === thread && s.agent === agent;
						return (
							<li key={`${s.agent}:${s.id}`} className={cn('group/session relative rounded-md', current ? 'bg-accent' : 'hover:bg-muted')}>
								<button type="button" disabled={busy} onClick={() => { open(s); onPick?.(); }}
									className="grid w-full gap-0.5 px-2.5 py-2 pr-8 text-left" aria-current={current || undefined}>
									<span className="truncate text-sm">{s.title}</span>
									<span className="text-[11px] text-muted-foreground">{nameOf(s.agent)} · {relative(s.updatedAt, t.locale)}</span>
								</button>
								<IconButton label={`${t.deleteConversation}: ${s.title}`} disabled={busy} onClick={() => remove(s)}
									className="absolute top-1/2 right-1 size-6 -translate-y-1/2 opacity-0 group-hover/session:opacity-100 hover:text-destructive focus-visible:opacity-100"><X /></IconButton>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
