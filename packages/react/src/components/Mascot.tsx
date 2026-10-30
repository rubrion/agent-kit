import { useEffect, useId, useRef } from 'react';
import type { Phase } from '../events.js';

/*
 * One pointer listener for every eye on the page (there is one next to each
 * answer): the position is kept here and each eye reads it on the next frame.
 */
type Watcher = () => void;
const watchers = new Set<Watcher>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;
function onMove(e: PointerEvent) {
	pointer = { x: e.clientX, y: e.clientY };
	if (frame) return;
	frame = requestAnimationFrame(() => {
		frame = 0;
		watchers.forEach((w) => w());
	});
}
function watch(w: Watcher) {
	if (!watchers.size) window.addEventListener('pointermove', onMove, { passive: true });
	watchers.add(w);
	return () => {
		watchers.delete(w);
		if (!watchers.size) window.removeEventListener('pointermove', onMove);
	};
}

/** How far the pupil travels from center, in viewBox units. */
const REACH = 6.5;
/** Pointer distance (px) at which the pupil reaches the edge. */
const FULL = 240;

/**
 * The default mascot: a stylized eye whose pupil follows the cursor. Idle, it
 * blinks now and then; thinking, the pupil drifts up and narrows; using a tool,
 * it scans side to side while the iris ring turns; speaking, the iris pulses.
 * Colors come from the theme (--primary for the iris, --foreground for the
 * pupil and the outline), so it reads on light and dark. Swap it with renderMascot.
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
	const svg = useRef<SVGSVGElement>(null);
	const look = useRef<SVGGElement>(null);

	useEffect(() => {
		if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const aim = () => {
			const el = svg.current;
			const g = look.current;
			if (!el || !g || !pointer) return;
			const r = el.getBoundingClientRect();
			if (!r.width) return;
			const dx = pointer.x - (r.left + r.width / 2);
			const dy = pointer.y - (r.top + r.height / 2);
			const d = Math.hypot(dx, dy) || 1;
			const k = (Math.min(d, FULL) / FULL) * REACH;
			// the eye is wider than tall: less room to travel vertically
			// CSS px on an SVG element are user units, so this moves in viewBox units
			g.style.transform = `translate(${((dx / d) * k).toFixed(2)}px, ${((dy / d) * k * 0.6).toFixed(2)}px)`;
		};
		aim();
		return watch(aim);
	}, []);

	return (
		<svg ref={svg} viewBox="0 0 64 64" width={size} height={size} focusable="false"
			className={['ak-mascot', `ak-mascot--${phase}`, jumping && phase === 'idle' && 'ak-jump', className].filter(Boolean).join(' ')}
			{...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
			<defs>
				<radialGradient id={`${id}-iris`} cx="40%" cy="38%" r="70%">
					<stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
					<stop offset="100%" stopColor="currentColor" />
				</radialGradient>
				<clipPath id={`${id}-eye`}>
					<path d="M7 32 C17 15 47 15 57 32 C47 49 17 49 7 32 Z" />
				</clipPath>
			</defs>

			{/* the badge */}
			<circle cx="32" cy="32" r="30" className="ak-mascot__badge" strokeWidth="2" />

			{/* the eye: the white, then the iris and pupil inside it, then the lids on top */}
			<g className="ak-mascot__eye">
				<path className="ak-mascot__white" d="M7 32 C17 15 47 15 57 32 C47 49 17 49 7 32 Z" />
				<g clipPath={`url(#${id}-eye)`}>
					<g ref={look} className="ak-mascot__look">
						<g className="ak-mascot__gaze">
							<circle className="ak-mascot__iris" cx="32" cy="32" r="11.5" fill={`url(#${id}-iris)`} />
							<circle className="ak-mascot__ring" cx="32" cy="32" r="8.6" fill="none" strokeWidth="1.3" strokeDasharray="3.2 2.4" />
							<circle className="ak-mascot__pupil" cx="32" cy="32" r="4.6" />
							<circle className="ak-mascot__glint" cx="29.2" cy="29" r="1.7" />
						</g>
					</g>
				</g>
				<path className="ak-mascot__lid" d="M7 32 C17 15 47 15 57 32 C47 49 17 49 7 32 Z" fill="none" strokeWidth="2.4" strokeLinejoin="round" />
				{/* a stroke of upper lid, heavier, so the shape reads as an eye at 24px */}
				<path className="ak-mascot__lash" d="M9 30 C19 15.5 45 15.5 55 30" fill="none" strokeWidth="3.4" strokeLinecap="round" />
			</g>
		</svg>
	);
}
