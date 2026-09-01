import { Link } from "react-router-dom";
import styles from "./StudyHomePage.module.css";
import appLogo from "../../../../expo/assets/images/icon.png";

export default function StudyHomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbOne}`} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbTwo}`} aria-hidden="true" />
      <section className={styles.shell} aria-labelledby="study-title">
        <header className={styles.header}>
          <span className={styles.status}><i /> Secure portal</span>
          <div className={styles.brandBlock}><img className={styles.logoImage} src={appLogo} alt="DYNAMIC study logo" /><div><p className={styles.brand}>DYNAMIC</p><p className={styles.brandSub}>Maternal &amp; newborn health research</p></div></div>
        </header>
        <div className={styles.content}>
          <p className={styles.eyebrow}>A MULTISITE STUDY · INDIA</p>
          <h1 id="study-title"><span>The Dynamics of Late Foetal and Neonatal</span><em>Mortality in Indian Context</em></h1>
          <p className={styles.lede}>A multisite study building clearer evidence for every mother, every newborn, and every community.</p>
          <Link className={styles.button} to="/login"><span>Enter study portal</span><b aria-hidden="true">↗</b></Link>
        </div>
        <footer className={styles.footer}><span>Study management platform</span><span className={styles.footerLine} /><span>Research · Fieldwork · Evidence</span></footer>
      </section>
    </main>
  );
}
