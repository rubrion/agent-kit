import { useId } from 'react';
import type { Phase } from '../events.js';

/**
 * The default mascot: growth rings around a core, no face. Idle, the rings
 * breathe; thinking, they pulse outward in turn; using a tool, the outer ring
 * turns; speaking, the core beats. Colors come from the theme (currentColor and
 * --primary), so it reads on light and dark. Swap it with renderMascot.
 */
export function Mascot({ phase = 'idle', size = 28, jumping, label, className }: {
	phase?: Phase;
	size?: number;
	/** Jumps while idle: only where it is an invitation (the corner button before the first click). */
	jumping?: boolean;
	/** Set when it stands alone; next to text that already says "Assistant", leave it decorative. */
	label?: string;
	className?: string;
}) {
	const id = useId().replace(/:/g, '');
	return (
		<svg viewBox="0 0 64 64" width={size} height={size} focusable="false"
			className={['ak-mascot', `ak-mascot--${phase}`, jumping && phase === 'idle' && 'ak-jump', className].filter(Boolean).join(' ')}
			{...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
			<defs>
				<radialGradient id={`${id}-g`} cx="45%" cy="40%" r="65%">
					<stop offset="0%" stopColor="var(--card, #fff)" />
					<stop offset="100%" stopColor="var(--muted, #eee)" />
				</radialGradient>
			</defs>
			<circle cx="32" cy="32" r="29" fill={`url(#${id}-g)`} className="ak-mascot__edge" strokeWidth="2" />
			<g fill="none" strokeLinecap="round">
				<circle className="ak-mascot__ring ak-mascot__ring--3" cx="31" cy="32.5" r="22" strokeWidth="1.8" strokeDasharray="112 26" />
				<circle className="ak-mascot__ring ak-mascot__ring--2" cx="32.5" cy="32" r="15" strokeWidth="1.8" />
				<circle className="ak-mascot__ring ak-mascot__ring--1" cx="32" cy="32.5" r="8.5" strokeWidth="1.8" />
			</g>
			<circle className="ak-mascot__core" cx="32.5" cy="32.5" r="3.4" />
		</svg>
	);
}
