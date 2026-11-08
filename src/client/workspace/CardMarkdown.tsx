import { memo, useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Raw HTML stays escaped and the renderer filters unsafe URL protocols.
export const CardMarkdown = memo(function CardMarkdown({ body, preview = false }: { body: string; preview?: boolean }) {
  return <div className="card-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => preview || !href ? <span>{children}</span> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    img: ({ src, alt }) => preview ? <span>{alt}</span> : <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />,
    input: ({ checked }) => <input type="checkbox" checked={checked ?? false} disabled aria-label={checked ? 'Completed task' : 'Incomplete task'} />,
  }}>{body}</Markdown></div>;
});

export function CardBodyPreview({ body }: { body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [body]);
  // The full, interactive description is available from Card details. A clipped
  // preview must not add invisible links to the tab order or intercept dragging.
  return <div ref={ref} className="workspace-card-body" data-overflow={overflow} inert aria-hidden="true"><CardMarkdown body={body} preview /></div>;
}
