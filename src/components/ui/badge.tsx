import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
}

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'border-transparent bg-zinc-100 text-zinc-900 shadow hover:bg-zinc-200',
    secondary: 'border-transparent bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
    destructive: 'border-transparent bg-red-950/80 text-red-300 border border-red-800/60',
    success: 'border-transparent bg-emerald-950/80 text-emerald-300 border border-emerald-800/60',
    warning: 'border-transparent bg-amber-950/80 text-amber-300 border border-amber-800/60',
    info: 'border-transparent bg-sky-950/80 text-sky-300 border border-sky-800/60',
    outline: 'text-zinc-300 border border-zinc-700',
  };

  return (
    <div
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono transition-colors ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
