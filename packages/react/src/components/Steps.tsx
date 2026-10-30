import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Check, ChevronRight, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Step } from '../events.js';
import { useAgent } from '../provider.js';
import { cn } from './ui.js';

/** The answer's markdown, sanitized (DOMPurify) before it reaches the page; each code block gets a copy button. */
export function Markdown({ text }: { text: string }) {
	const { t } = useAgent();
	const ref = useRef<HTMLDivElement>(null);
	const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }) as string), [text]);
	useLayoutEffect(() => {
		ref.current?.querySelectorAll('pre').forEach((pre) => {
			if (pre.querySelector('.ak-copy')) return;
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'ak-copy';
			b.textContent = t.copy;
			b.onclick = () => {
				navigator.clipboard?.writeText(pre.querySelector('code')?.textContent ?? '');
				b.textContent = t.copied;
				setTimeout(() => { b.textContent = t.copy; }, 1500);
			};
			pre.appendChild(b);
		});
	}, [html, t]);
	return <div ref={ref} className="ak-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

const seconds = (a: number, b?: number) => Math.max(1, Math.round(((b ?? Date.now()) - a) / 1000));

/** The thinking agent's reasoning: open while it thinks, folded after. */
export function ThinkStep({ step }: { step: Extract<Step, { kind: 'think' }> }) {
	const { t } = useAgent();
	const live = step.end === undefined;
	return (
		<details className="group/step rounded-lg border border-dashed bg-muted/40 text-sm" open={live}>
			<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-muted-foreground">
				<span className="flex gap-0.5" aria-hidden>
					{[0, 1, 2].map((i) => <i key={i} className={cn('size-1.5 rounded-full bg-primary/70', live && 'animate-pulse')} style={{ animationDelay: `${i * 160}ms` }} />)}
				</span>
				{live ? t.thinking : step.start ? t.thoughtFor(seconds(step.start, step.end)) : t.thinking.replace(/…$/, '')}
				<ChevronRight className="ml-auto size-3.5 transition-transform group-open/step:rotate-90" />
			</summary>
			<p className="border-t px-3 py-2 text-[13px] whitespace-pre-line text-muted-foreground">{step.text}</p>
		</details>
	);
}

const firstString = (args: Record<string, unknown> | undefined) => {
	const v = args && Object.values(args).find((x) => typeof x === 'string' || typeof x === 'number');
	return v === undefined ? undefined : String(v);
};

/** One card per tool call: spins, settles, and opens to show what was asked and what came back. */
export function ToolStep({ step }: { step: Extract<Step, { kind: 'tool' }> }) {
	const { t, config } = useAgent();
	const [running, done] = config.toolLabels?.[step.name] ?? [step.name, step.name];
	const args = step.args as Record<string, unknown> | undefined;
	const subject = (config.toolSubject ?? ((_n, a) => firstString(a)))(step.name, args);
	return (
		<details className="group/step rounded-lg border bg-card text-sm shadow-xs">
			<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5">
				<span className={cn('grid size-5 place-items-center rounded-full text-[11px]',
					step.state === 'running' ? 'bg-muted' : step.state === 'done' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')} aria-hidden>
					{step.state === 'running' ? <span className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
						: step.state === 'done' ? <Check className="size-3" /> : <X className="size-3" />}
				</span>
				<span className="min-w-0 flex-1 truncate">
					{step.state === 'running' ? running : done}
					{subject !== undefined && <em className="text-muted-foreground not-italic"> · {subject}</em>}
				</span>
				{step.end ? <span className="text-xs text-muted-foreground tabular-nums">{seconds(step.start, step.end)}s</span> : null}
				<ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open/step:rotate-90" />
			</summary>
			<div className="border-t px-3 py-2">
				<p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t.details}</p>
				<pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify({ args: step.args, result: step.result }, null, 2)}</pre>
			</div>
		</details>
	);
}
