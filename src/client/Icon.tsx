const paths = {
  details: 'M8 7h8M8 12h8M8 17h5M4 3h16v18H4z',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  issue: 'M12 8v5m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  pr: 'M6 8v8m12 0V9a4 4 0 0 0-4-4h-2m3-3-3 3 3 3M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0m12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  repo: 'M4 4h15v16H6a2 2 0 0 1 0-4h13M4 4v14M8 8h7',
  incoming: 'M4 4h16l2 15H2L4 4zm-1 9h5l2 3h4l2-3h5',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  close: 'm6 6 12 12M6 18 18 6',
  plus: 'M12 5v14M5 12h14',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  link: 'm9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
