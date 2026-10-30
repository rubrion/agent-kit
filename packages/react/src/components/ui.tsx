// The few primitives the kit needs, styled with the shadcn/ui tokens (bg-card,
// text-muted-foreground, ring-ring…), so they match any shadcn app without
// depending on its component files.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useAgent } from '../provider.js';
import { Mascot } from './Mascot.js';
import type { Phase } from '../events.js';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; size?: 'sm' | 'md' };

/** A square icon button; the label is both the tooltip and the accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, Btn>(({ label, children, className, size = 'sm', ...rest }, ref) => (
	<button ref={ref} type="button" title={label} aria-label={label} {...rest}
		className={cn('inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
			size === 'sm' ? 'size-8' : 'size-9', className)}>
		{children}
	</button>
));
IconButton.displayName = 'IconButton';

/** The app's mascot if it gave one (renderMascot), else the kit's. */
export function Avatar({ phase = 'idle', size = 28, jumping, className }: { phase?: Phase; size?: number; jumping?: boolean; className?: string }) {
	const { config } = useAgent();
	if (config.renderMascot) return <span className={cn('inline-grid shrink-0 place-items-center', className)}>{config.renderMascot({ phase, size, jumping })}</span>;
	return <Mascot phase={phase} size={size} jumping={jumping} className={className} />;
}
