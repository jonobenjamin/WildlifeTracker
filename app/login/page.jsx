'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/authContext';

const STEPS = { PASSWORD: 'password', FORGOT: 'forgot', PIN: 'pin' };

export default function LoginPage() {
  const { user, role, ready, loginWithPassword, requestPin, signInWithPin } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(STEPS.PASSWORD);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [emailName, setEmailName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (ready && user && role) {
      router.replace(role === 'admin' ? '/map' : '/map-users');
    }
  }, [ready, user, role, router]);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setMsg(null);
    if (!name.trim() || !password) {
      setMsg({ type: 'error', text: 'Please fill in all fields' });
      return;
    }
    setBusy(true);
    try {
      await loginWithPassword(name.trim(), password);
      setMsg({ type: 'success', text: 'Signed in! Redirecting...' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Login failed' });
      setBusy(false);
    }
  }

  async function handleSendPin(e) {
    e.preventDefault();
    setMsg(null);
    if (!emailName.trim() || !email.trim()) {
      setMsg({ type: 'error', text: 'Please fill in all fields' });
      return;
    }
    setBusy(true);
    try {
      await requestPin(email.trim(), emailName.trim());
      setStep(STEPS.PIN);
      setMsg({ type: 'success', text: 'PIN sent! Check your email.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to send PIN' });
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyPin(e) {
    e.preventDefault();
    setMsg(null);
    if (pin.length !== 6) {
      setMsg({ type: 'error', text: 'Please enter the 6-digit PIN' });
      return;
    }
    setBusy(true);
    try {
      await signInWithPin(email.trim(), pin);
      setMsg({ type: 'success', text: 'Signed in! Redirecting...' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Invalid PIN' });
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          'linear-gradient(rgba(58,19,17,0.72), rgba(67,81,45,0.78)), url(/data/icons/KPR_icon.png) center/cover no-repeat',
      }}
    >
      <div className="kpr-card w-full max-w-[420px] p-9">
        <div className="flex items-center gap-3.5 mb-2">
          <Image src="/data/icons/KPR.svg" alt="KPR" width={48} height={48} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--kpr-burgundy)' }}>
            KPR Monitoring
          </h1>
        </div>
        <p className="text-sm text-portal-text-muted mb-7 leading-relaxed">
          Sign in to access the admin portal, maps, and reports.
        </p>

        {step === STEPS.PASSWORD && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="kpr-label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                className="kpr-input"
                placeholder="Your full name"
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="kpr-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="kpr-input"
                placeholder="Your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="kpr-btn w-full" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
            <button
              type="button"
              className="block w-full text-center text-sm mt-1"
              style={{ color: 'var(--kpr-green)' }}
              onClick={() => {
                setMsg(null);
                setStep(STEPS.FORGOT);
              }}
            >
              Forgot password?
            </button>
          </form>
        )}

        {step === STEPS.FORGOT && (
          <form onSubmit={handleSendPin} className="space-y-4">
            <div>
              <label className="kpr-label" htmlFor="email-name">
                Full Name
              </label>
              <input
                id="email-name"
                className="kpr-input"
                placeholder="Your full name"
                value={emailName}
                onChange={(e) => setEmailName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="kpr-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="kpr-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="kpr-btn w-full" disabled={busy}>
              {busy ? 'Sending...' : 'Send PIN Code'}
            </button>
            <button
              type="button"
              className="kpr-btn-secondary w-full"
              onClick={() => {
                setMsg(null);
                setStep(STEPS.PASSWORD);
              }}
            >
              ← Back to password login
            </button>
          </form>
        )}

        {step === STEPS.PIN && (
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <p className="text-sm text-portal-text-muted leading-relaxed">
              Enter the 6-digit PIN sent to <strong>{email}</strong>
            </p>
            <div>
              <label className="kpr-label" htmlFor="pin">
                PIN Code
              </label>
              <input
                id="pin"
                className="kpr-input tracking-widest text-center text-lg"
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <button type="submit" className="kpr-btn w-full" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              className="kpr-btn-secondary w-full"
              onClick={() => {
                setMsg(null);
                setStep(STEPS.FORGOT);
              }}
            >
              ← Back
            </button>
          </form>
        )}

        {msg && (
          <div
            className={`mt-4 rounded-portal px-3.5 py-3 text-sm ${
              msg.type === 'error'
                ? 'bg-red-50 text-portal-danger border border-red-200'
                : 'bg-green-50 text-green-800 border border-green-200'
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
