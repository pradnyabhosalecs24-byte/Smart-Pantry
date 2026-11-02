import clsx from "clsx";
import { ChevronLeft, ChevronRight, LoaderCircle, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";

// ---------- Buttons ----------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-basil text-white hover:bg-basil-hover shadow-[0_1px_0_rgba(0,0,0,.08)]",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-oat hover:text-ink",
  danger: "bg-chilli text-white hover:opacity-90",
  subtle: "bg-basil-soft text-bay hover:brightness-95",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-[15px]",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={clsx("inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-oat hover:text-ink disabled:opacity-40", className)}>
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

// ---------- Form fields ----------

export function Field({ label, error, hint, children, required, className }: { label: string; error?: string; hint?: ReactNode; children: (id: string, describedBy?: string) => ReactNode; required?: boolean; className?: string }) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-chilli"> *</span>}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} role="alert" className="text-sm text-chilli">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const control = "w-full rounded-lg border bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-basil/40 disabled:opacity-60";

export function Input({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} aria-invalid={invalid || undefined} className={clsx(control, "h-10", invalid ? "border-chilli" : "border-line-strong", className)} />;
}

export function Select({ invalid, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select {...rest} aria-invalid={invalid || undefined} className={clsx(control, "h-10 pr-8", invalid ? "border-chilli" : "border-line-strong", className)}>
      {children}
    </select>
  );
}

export function Textarea({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} aria-invalid={invalid || undefined} className={clsx(control, "min-h-20 py-2", invalid ? "border-chilli" : "border-line-strong", className)} />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="font-semibold text-ink">
          {label}
        </label>
        {description && <p className="text-sm text-ink-2">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", checked ? "bg-basil" : "bg-line-strong")}
      >
        <span className={clsx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

// ---------- Layout pieces ----------

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={clsx("rounded-2xl border border-line bg-surface", className)}>{children}</As>;
}

export function CardHeader({ title, action, description }: { title: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — Smart Pantry`;
  }, [title]);
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] leading-tight font-[650] text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-ink-2">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-basil-soft text-basil">
          <Icon className="size-6" aria-hidden />
        </div>
      )}
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-xl border border-chilli/30 bg-chilli-soft px-4 py-3 text-sm text-chilli">
      <p className="font-semibold">Couldn't load this</p>
      <p className="mt-0.5">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", className)}>{children}</span>;
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
      <span className="text-ink-2">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        <IconButton icon={ChevronRight} label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)} />
      </div>
    </nav>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 border border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap", value === t.value ? "bg-basil-soft text-bay" : "text-ink-2 hover:text-ink")}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 num text-ink-3">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((x) => !x.hasAttribute("disabled"));
    // Focus the first form control (or the first button) when the dialog opens
    (el?.querySelector<HTMLElement>("input, select, textarea") ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,28,23,.45)] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          "sheet-in flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-ink-2">{message}</div>
    </Modal>
  );
}
