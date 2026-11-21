import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap',
    'transition-colors duration-150 cursor-pointer select-none',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:size-[1.125em] [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        secondary: 'bg-primary-subtle text-primary hover:bg-surface-subtle',
        outline: 'border border-border bg-surface text-foreground hover:bg-surface-subtle',
        ghost: 'text-foreground hover:bg-surface-subtle',
        danger: 'bg-danger text-danger-foreground shadow-sm hover:opacity-90',
      },
      /* md and lg meet the 44px minimum touch target (WCAG 2.5.5). */
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the styles onto the child element (e.g. a Next.js `<Link>`). */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
