import { Maximize2, MessageSquarePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAgent } from '../provider.js';
import { CompactConversation } from './Conversation.js';
import { Avatar, IconButton, cn } from './ui.js';

/**
 * The assistant in the corner of every screen. NOT modal: the point is reading
 * the screen while asking about it. It shares the conversation of the full
 * screen (AgentProvider sits above the router), so expanding carries it along,
 * even with an answer on its way.
 *
 * Rendered in a portal on body: an ancestor with a transform would become the
 * containing block of `fixed`. Hide it on the full assistant screen (`hidden`).
 */
export function ChatBox({ onExpand, hidden, subtitle, emptyTitle, side = 'right' }: {
	/** Shows the expand button; typically navigates to the assistant screen. */
	onExpand?: () => void;
	hidden?: boolean;
	subtitle?: string;
	emptyTitle?: string;
	side?: 'left' | 'right';
}) {
	const { t, busy, phase, newConversation, config } = useAgent();
	const seenKey = `${config.storageKey}_seen`;
	const [open, setOpen] = useState(false);
	// The jump is an introduction: once per visit (sessionStorage), never twice in
	// the same one, which makes it an invitation and not insistence.
	const [seen, setSeen] = useState(() => { try { return sessionStorage.getItem(seenKey) === '1'; } catch { return false; } });
	const button = useRef<HTMLButtonElement>(null);

	// Esc closes and gives focus back to the button; only bound while open
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented) return;
			// a popover or dialog of the screen on top handles its own Esc
			if (document.querySelector('[role=dialog][data-state=open], [role=alertdialog]')) return;
			setOpen(false);
			button.current?.focus();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open]);

	if (hidden || typeof document === 'undefined') return null;
	const jumping = !seen && phase === 'idle';

	return createPortal(
		<div className={cn('pointer-events-none fixed bottom-4 z-40 flex flex-col gap-3 print:hidden', side === 'right' ? 'right-4 items-end' : 'left-4 items-start')}>
			{open && (
				<section role="region" aria-label={t.assistant}
					className="ak-rise pointer-events-auto flex h-[min(560px,calc(100dvh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl">
					<header className="flex items-center gap-2 border-b px-3 py-2">
						<Avatar size={30} phase={phase} />
						<div className="min-w-0 flex-1">
							<h2 className="text-sm font-medium">{t.assistant}</h2>
							<p className="truncate text-xs text-muted-foreground">{subtitle ?? t.scope}</p>
						</div>
						<IconButton label={t.newConversation} onClick={newConversation}><MessageSquarePlus /></IconButton>
						{onExpand && <IconButton label={t.expand} onClick={() => { setOpen(false); onExpand(); }}><Maximize2 /></IconButton>}
						<IconButton label={t.close} onClick={() => setOpen(false)}><X /></IconButton>
					</header>
					<CompactConversation emptyTitle={emptyTitle} />
				</section>
			)}
			<button ref={button} type="button" aria-expanded={open} title={open ? t.close : t.open} aria-label={open ? t.close : t.open}
				onClick={() => {
					setSeen(true);
					try { sessionStorage.setItem(seenKey, '1'); } catch { /* jumps again next load */ }
					setOpen((o) => !o);
				}}
				// the whole button jumps, not just the drawing: a still circle around a jumping face looks loose
				className={cn('pointer-events-auto grid size-14 place-items-center rounded-full border bg-card text-foreground shadow-lg transition-transform hover:-translate-y-0.5',
					jumping && 'ak-jump', busy && !open && 'ring-2 ring-primary/50')}>
				{open ? <X className="size-5" /> : <Avatar size={40} phase={phase} />}
			</button>
		</div>,
		document.body,
	);
}
