import { cn } from '../lib/cn';

export interface LanguageOption {
  /** BCP 47 code, also used as the `lang` attribute of the option label. */
  value: string;
  /** Label in its own script, e.g. "हिन्दी", "English". */
  label: string;
}

export interface LanguageSwitcherProps {
  /** Accessible group label, e.g. "Language". */
  label: string;
  value: string;
  options: LanguageOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Segmented language toggle. Render it from a client component (it takes a callback). */
export function LanguageSwitcher({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: LanguageSwitcherProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center rounded-lg border border-border bg-surface p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.value}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => {
              if (!selected) {
                onChange(option.value);
              }
            }}
            className={cn(
              'min-h-9 cursor-pointer rounded-md px-3 text-sm font-semibold transition-colors',
              selected
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground',
              'disabled:cursor-wait disabled:opacity-60',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
