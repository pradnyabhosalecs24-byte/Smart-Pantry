/** Brand mark: a pantry jar with a leaf — drawn inline so it works offline and in both themes. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="8" y="4" width="16" height="4" rx="1.5" fill="var(--bay)" />
      <path d="M7 10.5c0-1.4 1.1-2.5 2.5-2.5h13c1.4 0 2.5 1.1 2.5 2.5V25a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V10.5Z" fill="var(--basil)" />
      <path d="M11 16.5h10" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16.2 24.5c-3.4 0-5.2-2.3-5.2-5.3 3.8-.4 6.6 1.3 7.4 4.3" fill="#fff" fillOpacity=".95" />
      <path d="M16.6 24.6c.1-2.6 1.4-4.9 4.4-6.1.6 3.3-1 5.8-4.4 6.1Z" fill="#fff" fillOpacity=".75" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className="font-display text-[17px] font-[750] text-ink">Smart Pantry</div>
        <div className="text-[11px] text-ink-3">Less waste, fresher food</div>
      </div>
    </div>
  );
}
