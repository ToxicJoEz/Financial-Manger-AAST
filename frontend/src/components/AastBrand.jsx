import { useSyncExternalStore } from 'react';
import logoBlue from '../assets/branding/aast-iec-logo-blue.png';
import logoWhite from '../assets/branding/aast-iec-logo-white.png';
import logoBlack from '../assets/branding/aast-iec-logo-black.png';

function subscribeTheme(callback) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const getTheme = () => document.documentElement.dataset.theme === 'dark';
const serverTheme = () => false;

export default function AastBrand({ application, inverse = false }) {
  const dark = useSyncExternalStore(subscribeTheme, getTheme, serverTheme);
  return <div className={`aast-app-brand${inverse ? ' aast-app-brand--inverse' : ''}`} aria-label={`AAST ${application}`}>
    <picture className="aast-app-brand-picture" aria-hidden="true">
      <source media="print" srcSet={logoBlack} />
      <img className="aast-app-brand-logo" src={inverse || dark ? logoWhite : logoBlue} alt="" width="72" height="52" />
    </picture>
    <span className="aast-app-brand-wordmark"><strong>AAST</strong><span>{application}</span></span>
  </div>;
}
