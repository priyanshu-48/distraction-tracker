import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { errorMessage, getToken, login, register, SETUP_PATH } from "@/app/auth";
import { AuthLayout } from "./AuthLayout";

// Same limits as the server (bcrypt ignores everything past 72 bytes).
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

function validate(email: string, password: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (password.length > MAX_PASSWORD) errors.password = `Use at most ${MAX_PASSWORD} characters.`;
  if (confirm !== password) errors.confirm = "Passwords do not match.";
  return errors;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (getToken() && !pending) return <Navigate to={SETUP_PATH} replace />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validate(email.trim(), password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await register(email.trim(), password);
    } catch (err) {
      setFormError(errorMessage(err, "Could not create the account. Please try again."));
      setPending(false);
      return;
    }
    try {
      await login(email.trim(), password);
      navigate(SETUP_PATH, { replace: true });
    } catch {
      setFormError("Your account was created, but signing in failed. Try signing in.");
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-teal hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          hint={`${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          required
        />
        <PasswordField
          id="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={errors.confirm}
          required
        />
        {formError ? (
          <p role="alert" className="text-sm text-coral">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
