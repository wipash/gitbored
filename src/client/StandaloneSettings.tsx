import { useContext, useEffect, useRef, useState } from 'react';
import { AccountSettingsContext } from './workspace/panels';
import { Icon } from './Icon';

/** The same account settings remain available before a canvas is mounted. */
export function StandaloneSettings() {
  const settings = useContext(AccountSettingsContext);
  const [open, setOpen] = useState(settings?.needsAttention ?? false);
  const trigger = useRef<HTMLButtonElement>(null);
  const attention = settings?.needsAttention ?? false;
  useEffect(() => {
    // A newly blocked account exposes recovery once; closing it stays possible.
    // oxlint-disable-next-line react/set-state-in-effect
    if (attention) setOpen(true);
  }, [attention]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="standalone-settings" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Settings</button>
    {open && <section className="workspace-floating-panel workspace-settings-panel" aria-label="Settings">
      <div className="incoming-heading"><h2>Settings</h2><button type="button" aria-label="Close Settings" onClick={close}><Icon name="close" /></button></div>
      <div className="workspace-panel-body">{settings?.content}</div>
    </section>}
  </div>;
}
