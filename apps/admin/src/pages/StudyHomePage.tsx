import { Link } from "react-router-dom";
import styles from "./StudyHomePage.module.css";
import appLogo from "../../../../expo/assets/images/icon.png";
import appDownloadQr from "../assets/app-download-qr.svg";
import motherAndBaby from "../assets/study-mother-baby.webp";

export default function StudyHomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="study-title">
        <header className={styles.header}>
          <div className={styles.brandBlock}>
            <img className={styles.logoImage} src={appLogo} alt="DYNAMIC study logo" />
            <div><p className={styles.brand}>DYNAMIC</p><p className={styles.brandSub}>Maternal &amp; newborn health research</p></div>
          </div>
          <span className={styles.status}><i aria-hidden="true" />Secure portal</span>
        </header>
        <div className={styles.heroBody}>
          <div className={styles.content}>
            <p className={styles.eyebrow}>A MULTISITE STUDY &middot; INDIA</p>
            <h1 id="study-title"><span>The Dynamics of</span><span>Late Foetal and</span><em>Neonatal Mortality</em><em>in Indian Context</em></h1>
            <p className={styles.lede}>A multisite study building clearer evidence<br className={styles.desktopBreak} /> for every mother, every newborn, and every community.</p>
            <Link className={styles.button} to="/login">Enter study portal <span aria-hidden="true">&#8599;</span></Link>
          </div>
          <div className={styles.illustration}><img src={motherAndBaby} alt="Illustration of a mother holding her newborn baby" /></div>
        </div>
      </section>
      <footer className={styles.footer}>
        <div className={styles.footerCopy}>
          <p>A multisite study building clearer evidence<br className={styles.desktopBreak} /> for every mother, every newborn, and every community.</p>
          <small>Study management platform <span aria-hidden="true">&mdash;</span> Research &middot; Fieldwork &middot; Evidence</small>
        </div>
        <a className={styles.appDownload} href="https://dynamicstudyindia.com/downloads/dynamic-field-app.apk">
          <img src={appDownloadQr} width="112" height="112" alt="QR code to download the DYNAMIC Android app" />
          <span><strong>Download Android app</strong><small>Scan to download or click here</small></span>
        </a>
      </footer>
    </main>
  );
}
