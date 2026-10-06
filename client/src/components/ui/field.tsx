import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 w-full rounded-xl bg-raised px-4 text-ink placeholder:text-ink-muted " +
  "focus-visible:outline-2 focus-visible:outline-teal aria-invalid:outline-2 aria-invalid:outline-coral";

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  /** Shown under the field and announced as an error; also marks the input invalid. */
  error?: string | null;
  hint?: string;
}

function describedBy(id: string, error?: string | null, hint?: string) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
}

function Messages({ id, error, hint }: { id: string; error?: string | null; hint?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-coral">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** A labelled text input with optional hint and error. */
export function TextField({ id, label, error, hint, className, ...props }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(inputClass, className)}
        {...props}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

/**
 * A password input with a show/hide button. The button is a real, keyboard-focusable control that
 * announces its state ("Show password" / "Hide password", pressed or not), so it works with screen
 * readers. The field keeps its `autoComplete` so password managers are unaffected.
 */
export function PasswordField({ id, label, error, hint, className, ...props }: FieldProps) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(inputClass, "pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </div>
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}
