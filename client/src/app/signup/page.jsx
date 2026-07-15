'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import Modal from '@/components/Modal'; 

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-ink">
          <p className="font-mono text-sm text-mist">Loading</p>
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show2faPrompt, setShow2faPrompt] = useState(false); 

  function validateEmail(email) {
    if (!email.includes('@')) {
      return 'Email must contain @ symbol';
    }

    const parts = email.split('@');
    if (parts.length !== 2) {
      return 'Invalid email format';
    }

    if (parts[0].length === 0 || parts[1].length === 0) {
      return 'Email must have content before and after @';
    }

    return null;
  }

  function validatePassword(password) {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/\d/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};:"\\|,.<>\/?]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return null;
  }

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');

      const emailError = validateEmail(email);
      if (emailError) {
        setError(emailError);
        return;
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }

      setLoading(true);

      try {
        await api.signup(email, password);
        setShow2faPrompt(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [email, password]
  );

  const handleSetup2fa = () => {
    setShow2faPrompt(false);
    router.push('/dashboard/settings?setup2fa=1');
  };

  const handleSkip2fa = () => {
    setShow2faPrompt(false);
    router.push(redirect);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-6">
      <div className="w-full max-w-sm rounded-sm border border-line bg-surface p-8">
        <Link href="/" className="font-mono text-sm text-signal">
          <img
            src="/lock.svg"
            alt="Envguard icon"
            className="inline-block h-5 w-5 text-signal align-middle"
          />{' '}
          <span className="align-middle">envguard</span>
        </Link>
        <h1 className="mt-6 text-2xl font-semibold text-paper">Create your account</h1>
        <p className="mt-1 text-sm text-mist">Encrypt your first secret in under a minute.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-mist">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-mist">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-line bg-ink px-3 py-2 text-sm text-paper outline-none focus:border-signal"
              placeholder="At least 8 characters"
            />
            <p className="mt-1 text-xs text-mist">
              Must be at least 8 characters, include uppercase, lowercase, number, and special character.
            </p>
          </div>

          {error && <p className="text-sm text-alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90 disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-mist">
          Already have an account?{' '}
          <Link href="/login" className="text-signal hover:underline">
            Log in
          </Link>
        </p>
      </div>

      {/* 2FA Onboarding Modal */}
      <Modal open={show2faPrompt} onClose={handleSkip2fa} title="Secure your account">
        <div className="space-y-4">
          <p className="text-sm text-mist">
            You can add an extra layer of security to your account by enabling
            two-factor authentication (2FA). This will require a 6-digit code from
            your authenticator app when you log in.
          </p>
          <p className="text-sm text-mist">
            Would you like to set it up now?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              onClick={handleSetup2fa}
              className="flex-1 rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
            >
              Set up now
            </button>
            <button
              onClick={handleSkip2fa}
              className="flex-1 rounded-sm border border-line px-4 py-2 text-sm text-mist hover:text-paper"
            >
              Skip for now
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}