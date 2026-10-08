import React from 'react';

export function Alert({
  className = '',
  variant = 'default',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' | 'success' }) {
  const variants = {
    default: 'bg-zinc-900 border-zinc-800 text-zinc-200',
    destructive: 'bg-red-950/40 border-red-900/60 text-red-200',
    success: 'bg-emerald-950/40 border-emerald-900/60 text-emerald-200',
  };

  return (
    <div
      role="alert"
      className={`relative w-full rounded-lg border p-4 text-sm [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
