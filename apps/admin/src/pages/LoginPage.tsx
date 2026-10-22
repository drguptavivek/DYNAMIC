import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import styles from "./LoginPage.module.css";
import appLogo from "../../../../expo/assets/images/icon.png";
import motherAndBaby from "../assets/study-mother-baby.webp";

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
    <main className={styles.container}>
      <header className={styles.topBar}>
        <span className={styles.topSecure}><i aria-hidden="true" /> Secure portal</span>
        <div className={styles.topBrand}><img src={appLogo} alt="DYNAMIC study logo" /><div><strong>DYNAMIC</strong><small>Maternal &amp; newborn health research</small></div></div>
      </header>
      <div className={styles.content}>
        <section className={styles.studyIntro} aria-labelledby="study-title">
          <div className={styles.studyCopy}>
            <p className={styles.studyEyebrow}>A MULTISITE STUDY &middot; INDIA</p>
            <h2 id="study-title">The Dynamics of Late Foetal and Neonatal Mortality <span>in Indian Context</span></h2>
            <p className={styles.studyDescription}>Building clearer evidence for every mother, every newborn, and every community.</p>
          </div>
          <img className={styles.illustration} src={motherAndBaby} alt="Illustration of a mother holding her newborn baby" />
        </section>
        <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.eyebrow}>AUTHORIZED ACCESS</p>
        <h1 id="login-title">{totpStep ? "Verify your access" : "Welcome back"}</h1>
        <p className={styles.subtitle}>{totpStep ? "Use your authenticator app to finish signing in." : "Sign in to the DYNAMIC study portal."}</p>

        <form onSubmit={handleSubmit}>
          {!totpStep ? <>
            <div className={styles.formGroup}><label htmlFor="username">Username</label><input id="username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} required /></div>
            <div className={styles.formGroup}><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} required /></div>
          </> : <div className={styles.formGroup}><label htmlFor="totp-code">Authenticator code</label><input id="totp-code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))} disabled={loading} autoFocus required /><small className={styles.stepHint}>Enter the 6-digit code from your authenticator app.</small></div>}

          {error && <div className={styles.error} role="alert">{error}</div>}

          <button type="submit" disabled={loading} className={styles.submitBtn}>
            <span>{loading ? "Verifying access..." : totpStep ? "Verify and sign in" : "Continue securely"}</span><b aria-hidden="true">↗</b>
          </button>
          {totpStep && <button type="button" disabled={loading} className={styles.backBtn} onClick={() => { setTotpStep(false); setTotpCode(""); setError(""); }}>Back to password</button>}
        </form>
        <p className={styles.notice}>Protected with encrypted authentication and TOTP</p>
        </section>
      </div>
      <footer className={styles.footer}>Study management platform <span aria-hidden="true">&middot;</span> Research &middot; Fieldwork &middot; Evidence</footer>
    </main>
  );
}
