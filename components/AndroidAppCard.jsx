'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiUrl } from '@/lib/api';
import { auth } from '@/lib/firebase/client';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function versionFromFileName(name) {
  const match = String(name || '').match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : '';
}

function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.send(file);
  });
}

export default function AndroidAppCard({ showUpload = false, variant = 'portal' }) {
  const isLogin = variant === 'login';
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/app-releases/android'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Could not load Android app');
      setRelease(data.data || null);
    } catch (err) {
      setError(err.message || 'Could not load Android app');
      setRelease(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onPickFile(next) {
    setFile(next || null);
    setMsg(null);
    if (!next) return;
    const fromName = versionFromFileName(next.name);
    if (fromName && !versionName) setVersionName(fromName);
  }

  async function publish(e) {
    e.preventDefault();
    setMsg(null);
    if (!file) {
      setMsg({ type: 'error', text: 'Choose an APK file first' });
      return;
    }
    if (!versionName.trim() || !versionCode.trim()) {
      setMsg({ type: 'error', text: 'Enter the version name and version code from the APK' });
      return;
    }
    const code = Number(versionCode);
    if (!Number.isFinite(code) || code < 1) {
      setMsg({ type: 'error', text: 'Version code must be a positive number (e.g. 20)' });
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const start = await apiFetch('/api/app-releases/android/upload-url', {
        method: 'POST',
        body: JSON.stringify({
          versionName: versionName.trim(),
          versionCode: code,
          fileName: file.name,
          contentType: 'application/vnd.android.package-archive',
          sizeBytes: file.size,
        }),
      });
      const ticket = start.data;
      await putWithProgress(ticket.uploadUrl, file, ticket.contentType, setProgress);
      const published = await apiFetch('/api/app-releases/android/complete', {
        method: 'POST',
        body: JSON.stringify({
          ...ticket,
          notes: notes.trim(),
        }),
      });
      setRelease(published.data || null);
      setFile(null);
      setNotes('');
      setProgress(1);
      setMsg({ type: 'success', text: `Published ${ticket.versionName} (${ticket.versionCode}). People can download it from this page.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Publish failed' });
    } finally {
      setBusy(false);
    }
  }

  const downloadHref = release?.downloadUrl || '/api/app-releases/android/file';
  const cardClass = isLogin
    ? 'kpr-card w-full max-w-[420px] p-7 mt-4'
    : 'kpr-card p-6';

  return (
    <section className={cardClass}>
      <h2
        className={isLogin ? 'text-lg font-bold mb-1' : 'text-base font-semibold mb-1'}
        style={isLogin ? { color: 'var(--kpr-burgundy)' } : undefined}
      >
        Download Android app
      </h2>
      <p className="text-sm text-portal-text-muted mb-4 leading-relaxed">
        Install or update the KPR field app on Android. After you install it, the phone will tell you
        when a newer version is published here.
      </p>

      {loading ? (
        <p className="text-sm text-portal-text-muted">Checking for the latest app…</p>
      ) : error ? (
        <p className="text-sm text-portal-danger">{error}</p>
      ) : release?.downloadUrl ? (
        <div className="space-y-3">
          <div className="rounded-portal border border-portal-border bg-portal-surface-muted/50 px-3.5 py-3 text-sm">
            <div className="font-semibold">Version {release.versionName}</div>
            <div className="text-portal-text-muted text-xs mt-0.5">
              Build {release.versionCode}
              {release.sizeBytes ? ` · ${formatBytes(release.sizeBytes)}` : ''}
              {release.uploadedAt ? ` · ${formatDate(release.uploadedAt)}` : ''}
            </div>
            {release.notes ? <p className="text-xs mt-2">{release.notes}</p> : null}
          </div>
          <a className="kpr-btn w-full" href={downloadHref} download={release.fileName || 'KPR-monitor.apk'}>
            Download APK
          </a>
        </div>
      ) : (
        <p className="text-sm text-portal-text-muted">
          {showUpload
            ? 'No Android app published yet. Upload an APK below.'
            : 'The Android app is not published yet. Ask an admin to upload it here.'}
        </p>
      )}

      {showUpload && auth?.currentUser && (
        <form onSubmit={publish} className="mt-6 pt-5 border-t border-portal-border space-y-3">
          <h3 className="text-sm font-semibold">Publish a new APK</h3>
          <p className="text-xs text-portal-text-muted leading-relaxed">
            Use the same APK you would send by WhatsApp or email. It replaces the download above. Phones
            already on an older build will be asked to update.
          </p>
          <div>
            <label className="kpr-label" htmlFor="apk-file">
              APK file
            </label>
            <input
              id="apk-file"
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              className="kpr-input"
              disabled={busy}
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            {file ? (
              <p className="text-xs text-portal-text-muted mt-1">
                {file.name} · {formatBytes(file.size)}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="kpr-label" htmlFor="apk-version-name">
                Version name
              </label>
              <input
                id="apk-version-name"
                className="kpr-input"
                placeholder="2.1.0"
                value={versionName}
                disabled={busy}
                onChange={(e) => setVersionName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="kpr-label" htmlFor="apk-version-code">
                Version code
              </label>
              <input
                id="apk-version-code"
                className="kpr-input"
                placeholder="20"
                inputMode="numeric"
                value={versionCode}
                disabled={busy}
                onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
          </div>
          <div>
            <label className="kpr-label" htmlFor="apk-notes">
              Notes (optional)
            </label>
            <input
              id="apk-notes"
              className="kpr-input"
              placeholder="What changed in this build"
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {busy ? (
            <div className="h-2 rounded-full bg-portal-surface-muted overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  background: 'var(--kpr-green)',
                }}
              />
            </div>
          ) : null}
          {msg ? (
            <p className={`text-sm ${msg.type === 'error' ? 'text-portal-danger' : 'text-green-800'}`}>
              {msg.text}
            </p>
          ) : null}
          <button type="submit" className="kpr-btn w-full" disabled={busy}>
            {busy ? `Uploading… ${Math.round(progress * 100)}%` : 'Upload and publish'}
          </button>
        </form>
      )}
    </section>
  );
}
