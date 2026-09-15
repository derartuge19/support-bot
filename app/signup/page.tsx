'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes('already')
          ? 'That email is already registered.'
          : signUpError.message,
      );
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace('/');
      router.refresh();
    } else {
      setMessage(
        'Account created. Check your email to confirm your account, then sign in.',
      );
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-red-50 via-white to-red-100 p-4 dark:from-gray-900 dark:via-gray-800 dark:to-red-950">
      <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white/85 p-6 shadow-2xl backdrop-blur-xl dark:border-red-950 dark:bg-gray-800/85 md:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 overflow-hidden rounded-2xl bg-linear-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/30">
            <Image
              src="/logo.jpg"
              alt="Spidey"
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-bold text-red-700 dark:text-red-300">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Start chatting with Spidey
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-linear-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-red-500/25 transition hover:from-red-600 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-red-600 hover:text-red-700 dark:text-red-300"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
