import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { Status } from "../lib/scoring";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-mist-50 shadow-level-1 hover:bg-brand-700/90 disabled:bg-brand-700/50",
  accent: "bg-brand-700 text-mist-50 shadow-level-2 hover:bg-brand-700/90 disabled:bg-brand-700/50",
  secondary: "bg-white text-ink border border-mist-300 shadow-level-1 hover:bg-mist-100 disabled:opacity-50",
  ghost: "text-ink-soft hover:bg-mist-100 hover:text-ink disabled:opacity-50",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

const fieldBase =
  "w-full rounded-xl border border-mist-300 bg-white px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/15 disabled:bg-mist-100 disabled:text-ink-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(fieldBase, "py-2 leading-relaxed", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

/** Label + control + hint/error. Pass a render function to get the generated id. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
  optional,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  optional?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-muted">(optional)</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-mist-200/80 bg-white shadow-level-2", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-mist-200 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-base font-medium text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export const STATUS_LABEL: Record<Status, string> = {
  on: "On target",
  watch: "Watch",
  off: "Off target",
  none: "No data yet",
};

const statusStyles: Record<Status, string> = {
  on: "bg-good-50 text-good ring-good/25",
  watch: "bg-watch-50 text-watch ring-watch/30",
  off: "bg-off-50 text-off ring-off/25",
  none: "bg-mist-100 text-ink-muted ring-mist-300",
};

export function StatusBadge({ status, label, className }: { status: Status; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        statusStyles[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-mist-100 px-2.5 py-0.5 text-xs font-medium text-ink-soft whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-10 text-sm text-ink-muted", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-mist-100 text-brand-700 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="font-display text-lg text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div role="alert" className={cn("rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800", className)}>
      {children}
    </div>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEscape(open, onClose);
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-level-4 sm:rounded-3xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist-200/80 px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-mist-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-mist-200/80 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  headerExtra?: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-mist-50 shadow-level-4 sm:m-3 sm:h-[calc(100%-1.5rem)] sm:overflow-hidden sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-mist-200/80 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          {headerExtra}
          <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-mist-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("no-scrollbar flex gap-1 overflow-x-auto", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            value === it.value
              ? "bg-brand-700 text-mist-50 shadow-level-2"
              : "text-ink-muted hover:bg-mist-100 hover:text-ink",
          )}
        >
          {it.label}
          {it.count != null && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] leading-4 font-semibold",
                value === it.value ? "bg-mist-50/20 text-mist-50" : "bg-mist-100 text-ink-soft",
              )}
            >
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-mist-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-medium text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A KPI tile, after Malaya's KpiCard: eyebrow label, display-size value, a faint brand glow. */
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "warn";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "lift relative h-full overflow-hidden rounded-2xl border border-mist-200/80 bg-white p-5 shadow-level-2",
        className,
      )}
    >
      <div className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full bg-brand-700/5 blur-2xl" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {icon && <span className="text-brand-700/70 [&_svg]:size-4">{icon}</span>}
      </div>
      <p
        className={cn(
          "relative mt-2 font-display text-[26px] leading-tight tabular-nums sm:text-[28px]",
          tone === "warn" ? "text-terra-600" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="relative mt-1 truncate text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}
