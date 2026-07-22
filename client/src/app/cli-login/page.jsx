// client/app/cli-login/page.js (App Router)
'use client';
import { useState } from 'react';
import { api } from '@/lib/api'; // adjust path

export default function CliLogin() {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('');
    try {
      await api.cli.approve(code.trim());
      setStatus('✅ Approved! You can now close this page and return to your terminal.');
    } catch (err) {
      setStatus('❌ ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '50px auto', textAlign: 'center' }}>
      <h1>EnvGuard CLI Login</h1>
      <p>Enter the 6‑digit code shown in your terminal:</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. A1B2C3"
          style={{ padding: '10px', fontSize: '1.2rem', width: '100%' }}
          maxLength={6}
        />
        <button type="submit" disabled={loading} style={{ marginTop: 10, padding: '10px 20px' }}>
          {loading ? 'Approving...' : 'Approve'}
        </button>
      </form>
      {status && <p style={{ marginTop: 20 }}>{status}</p>}
    </div>
  );
}