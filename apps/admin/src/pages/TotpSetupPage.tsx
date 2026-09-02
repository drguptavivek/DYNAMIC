import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import styles from "./TotpSetupPage.module.css";

type TotpSetup = { secret: string; otpauth_uri: string };

export default function TotpSetupPage() {
  const navigate = useNavigate();
  const { markTotpEnabled } = useAuth();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const setupRequestStartedRef = useRef(false);
  const enableRequestStartedRef = useRef(false);

  useEffect(() => {
    if (setupRequestStartedRef.current) return;
    setupRequestStartedRef.current = true;
    let cancelled = false;
    api.post<TotpSetup>("/auth/totp/setup", {})
      .then(async (value) => {
        if (cancelled) return;
        setSetup(value);
        setQrDataUrl(await QRCode.toDataURL(value.otpauth_uri, { width: 240, margin: 2 }));
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to start authenticator setup"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleEnable(event: React.FormEvent) {
    event.preventDefault();
    if (enableRequestStartedRef.current || saving) return;
    enableRequestStartedRef.current = true;
    setError("");
    setSaving(true);
    try {
      await api.post("/auth/totp/enable", { code });
      markTotpEnabled();
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid authenticator code");
    } finally {
      setSaving(false);
      enableRequestStartedRef.current = false;
    }
  }

  return <main className={styles.page}><section className={styles.card}>
    <p className={styles.kicker}>SECURITY SETUP</p>
    <h1>Enable your authenticator</h1>
    <p className={styles.copy}>Scan this QR code with Google Authenticator, Microsoft Authenticator, or another TOTP app. This step is required before continuing.</p>
    {loading && <p>Preparing secure setup…</p>}
    {setup && <>
      {qrDataUrl && <img className={styles.qr} src={qrDataUrl} alt="Authenticator setup QR code" />}
      <p className={styles.secretLabel}>Can’t scan? Enter this key manually:</p>
      <code className={styles.secret}>{setup.secret}</code>
      <form onSubmit={handleEnable}>
        <label className={styles.label} htmlFor="totp-code">6-digit authenticator code</label>
        <input id="totp-code" className={styles.input} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required disabled={saving} />
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.button} type="submit" disabled={saving || code.length !== 6}>{saving ? "Verifying…" : "Enable authenticator"}</button>
      </form>
    </>}
    {!loading && !setup && error && <div className={styles.error}>{error}</div>}
  </section></main>;
}
