import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

    const variants = {
      default: 'bg-zinc-100 text-zinc-900 shadow hover:bg-zinc-200 active:bg-zinc-300 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200',
      destructive: 'bg-red-600 text-zinc-50 shadow-sm hover:bg-red-700 active:bg-red-800',
      outline: 'border border-zinc-700 bg-transparent shadow-sm hover:bg-zinc-800 hover:text-zinc-50 text-zinc-300',
      secondary: 'bg-zinc-800 text-zinc-200 shadow-sm hover:bg-zinc-700',
      ghost: 'hover:bg-zinc-800 hover:text-zinc-50 text-zinc-300',
      link: 'text-zinc-300 underline-offset-4 hover:underline',
    };

    const sizes = {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 rounded-md px-3 text-xs',
      lg: 'h-10 rounded-md px-8',
      icon: 'h-9 w-9',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
