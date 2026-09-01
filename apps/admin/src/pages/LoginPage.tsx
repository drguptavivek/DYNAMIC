import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import styles from "./LoginPage.module.css";
import appLogo from "../../../../expo/assets/images/icon.png";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpStep, setTotpStep] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login(username, password, totpCode || undefined);
      navigate(user.totp_enabled ? "/dashboard" : "/security/totp-setup");
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "TOTP_REQUIRED") {
        setTotpStep(true);
        setError("");
      } else setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.topBar}>
        <span className={styles.topSecure}><i /> Secure portal</span>
        <div className={styles.topBrand}><img src={appLogo} alt="DYNAMIC study logo" /><div><strong>DYNAMIC</strong><small>Maternal &amp; newborn health research</small></div></div>
      </header>
      <header className={styles.studyHeader}>
        <p>The Dynamics of Late Foetal and Neonatal Mortality<br /><span>in Indian Context</span></p>
      </header>
      <div className={styles.card}>
        <p className={styles.eyebrow}>AUTHORIZED ACCESS</p>
        <h1>Welcome back</h1>

        <form onSubmit={handleSubmit}>
          {!totpStep ? <>
            <div className={styles.formGroup}><label htmlFor="username">Username</label><input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} required /></div>
            <div className={styles.formGroup}><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} required /></div>
          </> : <div className={styles.formGroup}><label htmlFor="totp-code">Authenticator code</label><input id="totp-code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))} disabled={loading} autoFocus required /><small className={styles.stepHint}>Enter the 6-digit code from your authenticator app.</small></div>}

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            <span>{loading ? "Verifying access..." : totpStep ? "Verify and sign in" : "Continue securely"}</span><b aria-hidden="true">↗</b>
          </button>
        </form>
        <p className={styles.notice}><span>⌁</span> Protected with encrypted authentication and TOTP</p>
      </div>
    </div>
  );
}
