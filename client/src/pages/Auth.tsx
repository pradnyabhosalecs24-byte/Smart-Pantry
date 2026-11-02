import { LanguageSelect } from "../components/LanguageSelect";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";

/** After signing in, go back to the page that asked for it (e.g. an invite link), never to another site. */
function useReturnTo() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}
import { toast } from "sonner";
import { LogoMark } from "../components/Logo";
import { Button, Field, Input } from "../components/ui";
import { useAuth } from "../context/auth";
import { ApiError, errorMessage, post } from "../lib/api";
import type { User } from "../lib/types";

/** A pantry shelf drawn in the brand colours: jars whose fill levels echo the freshness meter. */
function ShelfIllustration() {
  const jars = [
    { x: 30, h: 92, fill: 0.82, c: "var(--basil)" },
    { x: 118, h: 120, fill: 0.55, c: "var(--turmeric-bar)" },
    { x: 214, h: 84, fill: 0.25, c: "var(--chilli)" },
    { x: 298, h: 108, fill: 0.68, c: "var(--basil)" },
  ];
  return (
    <svg viewBox="0 0 400 220" className="w-full max-w-md" role="img" aria-label="Illustration of jars on a pantry shelf">
      {jars.map((j, i) => {
        const w = 72;
        const y = 180 - j.h;
        return (
          <g key={i}>
            <rect x={j.x + 10} y={y - 12} width={w - 20} height="12" rx="3" fill="var(--bay)" />
            <rect x={j.x} y={y} width={w} height={j.h} rx="12" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
            <rect x={j.x + 6} y={y + j.h * (1 - j.fill)} width={w - 12} height={j.h * j.fill - 6} rx="8" fill={j.c} opacity=".85" />
            <rect x={j.x + 14} y={y + 16} width={w - 28} height="16" rx="3" fill="var(--surface)" opacity=".9" />
          </g>
        );
      })}
      <rect x="10" y="180" width="380" height="10" rx="3" fill="var(--bay)" />
      <rect x="30" y="190" width="10" height="22" fill="var(--bay)" opacity=".6" />
      <rect x="360" y="190" width="10" height="22" fill="var(--bay)" opacity=".6" />
    </svg>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  document.title = `${title} — Smart Pantry`;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-basil-soft p-12 lg:flex">
        <Link to="/welcome" className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="font-display text-xl font-[750] text-bay">Smart Pantry</span>
        </Link>
        <div>
          <ShelfIllustration />
          <h2 className="mt-8 max-w-md text-[34px] leading-[1.15] font-[650] text-bay">Know what's in your kitchen, and what to use first.</h2>
          <p className="mt-3 max-w-md text-ink-2">Track expiry dates batch by batch, get reminded before food goes off, and see how much you're saving by wasting less.</p>
        </div>
        <p className="text-sm text-ink-3">Smart Food Inventory & Waste Reduction System</p>
      </div>
      <div className="relative flex items-center justify-center px-5 py-10">
        <LanguageSelect className="absolute top-4 right-4 inline-flex" />
        <div className="w-full max-w-sm">
          <Link to="/welcome" className="mb-8 flex items-center gap-2 lg:hidden">
            <LogoMark />
            <span className="font-display text-lg font-[750]">Smart Pantry</span>
          </Link>
          <h1 className="text-[30px] font-[650]">{title}</h1>
          <p className="mt-1 mb-6 text-ink-2">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const handle = (e: unknown) => {
    if (e instanceof ApiError && Object.keys(e.fields).length) {
      setErrors(e.fields);
      setFormError(null);
    } else setFormError(errorMessage(e));
  };
  return { errors, setErrors, formError, setFormError, handle };
}

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const linkState = useLocation().state;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, formError, setFormError, handle } = useFormErrors();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!email.trim()) v.email = "Enter your email";
    if (!password) v.password = "Enter your password";
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await post<{ user: User }>("/auth/login", { email, password });
      setUser(r.user);
      navigate(returnTo, { replace: true });
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your pantry.">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-lg bg-chilli-soft px-3 py-2 text-sm text-chilli">
            {formError}
          </p>
        )}
        <Field label="Email" error={errors.email}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} />}
        </Field>
        <div className="-mt-1 text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-basil hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-center text-sm text-ink-2">
          New here?{" "}
          <Link to="/register" state={linkState} className="font-semibold text-basil hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const linkState = useLocation().state;
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, formError, setFormError, handle } = useFormErrors();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!form.name.trim()) v.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) v.email = "Enter a valid email address";
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) v.password = "Use at least 8 characters with a letter and a number";
    if (form.confirm !== form.password) v.confirm = "Passwords don't match";
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await post<{ user: User }>("/auth/register", { name: form.name, email: form.email, password: form.password });
      setUser(r.user);
      toast.success("Account created. Your pantry is ready.");
      navigate(returnTo, { replace: true });
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your pantry" subtitle="It takes less than a minute.">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-lg bg-chilli-soft px-3 py-2 text-sm text-chilli">
            {formError}
          </p>
        )}
        <Field label="Name" error={errors.name}>
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={!!errors.email} />}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} invalid={!!errors.password} />}
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} invalid={!!errors.confirm} />}
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-ink-2">
          Already have an account?{" "}
          <Link to="/login" state={linkState} className="font-semibold text-basil hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; devResetUrl?: string; emailConfigured: boolean } | null>(null);
  const { errors, setErrors, formError, handle } = useFormErrors();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrors({ email: "Enter a valid email address" });
      return;
    }
    setBusy(true);
    try {
      setResult(await post("/auth/forgot-password", { email }));
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll send a reset link to your email.">
      {result ? (
        <div className="flex flex-col gap-4">
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${result.emailConfigured ? "bg-basil-soft text-bay" : "bg-turmeric-soft text-turmeric"}`}>
            {result.message}
          </p>
          {result.devResetUrl && (
            <div className="rounded-lg border border-dashed border-line-strong p-3 text-sm">
              <p className="font-semibold">Development mode</p>
              <p className="mt-1 text-ink-2">Email isn't set up, so here is the reset link directly. This is never shown in production.</p>
              <a href={result.devResetUrl.replace(/^https?:\/\/[^/]+/, "")} className="mt-2 inline-block font-semibold text-basil underline">
                Open reset link
              </a>
            </div>
          )}
          <Link to="/login" className="text-sm font-semibold text-basil hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {formError && (
            <p role="alert" className="rounded-lg bg-chilli-soft px-3 py-2 text-sm text-chilli">
              {formError}
            </p>
          )}
          <Field label="Email" error={errors.email}>
            {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} />}
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Send reset link
          </Button>
          <Link to="/login" className="text-center text-sm font-semibold text-basil hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, formError, setFormError, handle } = useFormErrors();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) v.password = "Use at least 8 characters with a letter and a number";
    if (confirm !== password) v.confirm = "Passwords don't match";
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await post<{ message: string }>("/auth/reset-password", { token, password });
      toast.success(r.message);
      navigate("/login", { replace: true });
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Reset links work once and expire after 30 minutes.">
      {!token ? (
        <p role="alert" className="rounded-lg bg-chilli-soft px-3 py-2 text-sm text-chilli">
          This reset link is incomplete. <Link to="/forgot-password" className="font-semibold underline">Request a new one</Link>.
        </p>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {formError && (
            <p role="alert" className="rounded-lg bg-chilli-soft px-3 py-2 text-sm text-chilli">
              {formError} <Link to="/forgot-password" className="font-semibold underline">Request a new link</Link>
            </p>
          )}
          <Field label="New password" error={errors.password}>
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} />}
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} />}
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
