'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

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
  const [enable2fa, setEnable2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await api.signup(email, password);
      // If they opted in, send them to Settings to scan the QR code and
      // finish setup right away, instead of duplicating that flow here.
      router.push(enable2fa ? '/dashboard/settings?setup2fa=1' : redirect);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
          </div>

          <label className="flex items-start gap-2 text-sm text-mist">
            <input
              type="checkbox"
              checked={enable2fa}
              onChange={(e) => setEnable2fa(e.target.checked)}
              className="mt-0.5 accent-signal"
            />
            <span>
              Enable two-factor authentication (recommended) — you&apos;ll scan a QR code with
              Google Authenticator, Authy, or a similar app right after signing up.
            </span>
          </label>

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
    </main>
  );
}