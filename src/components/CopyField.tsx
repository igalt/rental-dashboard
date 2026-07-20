'use client';

import { useState } from 'react';

interface Props {
  label: string;
  value: string;
}

export function CopyField({ label, value }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border border-rule rounded-sm bg-paper p-2">
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-soft mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <p dir="auto" className="font-mono text-xs text-ink flex-1 min-w-0 break-words">
          {value}
        </p>
        <button
          onClick={handleCopy}
          className="shrink-0 px-2 py-1 rounded-sm border border-rule text-[10px] font-mono uppercase tracking-wide text-ink-soft hover:border-rust hover:text-rust-dark transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
