import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { TENANT_SMS_DISCLOSURE, MANAGEMENT_SMS_DISCLOSURE } from "@/lib/smsConsent";

export const metadata: Metadata = {
  title: "SMS consent evidence",
  description: "How RentFrayLite collects separate, optional consent for payment-status text messages.",
  robots: { index: false, follow: false },
};

const captures = [
  {
    "name": "customer-opt-in",
    "title": "Customer payment form",
    "caption": "The separate optional SMS checkbox is unchecked. The name, unit and phone number are fictional.",
    "alt": "Actual customer payment form with fictional details and the optional SMS consent checkbox unchecked.",
    "width": 622,
    "height": 710,
    "mobileWidth": 356,
    "mobileHeight": 895
  },
  {
    "name": "manager-off",
    "title": "Manager example: notifications OFF",
    "caption": "This fictional example shows notifications OFF before the manager enables them. No setting was saved.",
    "alt": "Actual manager Payment SMS Notifications control showing OFF in a fictional unsaved example.",
    "width": 640,
    "height": 48,
    "mobileWidth": 358,
    "mobileHeight": 48
  },
  {
    "name": "manager-consent",
    "title": "Manager example: consent is still a separate choice",
    "caption": "Notifications are ON for this local illustration. The separate consent checkbox is unchecked, and no form was submitted.",
    "alt": "Actual manager component showing notifications ON and the separate consent checkbox unchecked with a fictional phone number.",
    "width": 640,
    "height": 192,
    "mobileWidth": 358,
    "mobileHeight": 288
  }
];

function ConsentCapture({ capture }: { capture: (typeof captures)[number] }) {
  return <figure>
    <figcaption><strong>{capture.title}</strong>{capture.caption}</figcaption>
    <picture>
      <source media="(max-width: 600px)" srcSet={`/sms-consent/${capture.name}-mobile.png`} width={capture.mobileWidth} height={capture.mobileHeight}/>
      <Image unoptimized src={`/sms-consent/${capture.name}.png`} width={capture.width} height={capture.height} alt={capture.alt}/>
    </picture>
    <div className="rfl-evidence-image-links">
      <a href={`/sms-consent/${capture.name}.png`}>Open full-size desktop capture</a>
      <a href={`/sms-consent/${capture.name}-mobile.png`}>Open full-size mobile capture</a>
    </div>
  </figure>;
}

export default function SmsConsentPage() {
  return <main className="rfl-legal-page rfl-sms-evidence"><article className="rfl-legal-card">
    <header className="rfl-legal-header">
    <Link className="rfl-evidence-back" href="/">Back to RentFrayLite</Link>
    <h1>How SMS consent is collected</h1>
    <p>RentFrayLite is operated by <strong>CBA Processing LLC</strong>.</p>
    </header>
    <p>Payment-status texts are optional. Message frequency varies; message and data rates may apply. Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> to request help.</p>
    <p className="rfl-evidence-note">These are genuine browser captures of the actual RentFrayLite controls, rendered locally with fictional example details. No forms were submitted. The images are examples, not interactive opt-in forms.</p>
    <section aria-labelledby="customer-consent-title">
      <h2 id="customer-consent-title">Customer consent</h2>
      <p>Customers opt in using a separate, unchecked checkbox in the payment form. Entering a phone number alone does not provide consent. Consent is optional and is not a condition of payment.</p>
      <ConsentCapture capture={captures[0]}/>
      <details><summary>Read the exact customer disclosure</summary><p>{TENANT_SMS_DISCLOSURE}</p></details>
    </section>
    <section aria-labelledby="manager-consent-title">
      <h2 id="manager-consent-title">Manager consent</h2>
      <p>Managers separately enable notifications and give consent in <strong>Manage → Payment SMS Notifications</strong>. They enter their authorized mobile number and check the separate consent box before saving. Turning the notification setting ON alone does not check the consent box.</p>
      <ConsentCapture capture={captures[1]}/>
      <ConsentCapture capture={captures[2]}/>
      <details><summary>Read the exact manager disclosure</summary><p>{MANAGEMENT_SMS_DISCLOSURE}</p></details>
    </section>
    <section aria-labelledby="consent-choices-title">
      <h2 id="consent-choices-title">Your choice</h2>
      <p>Consent is optional. Customers can leave the payment-form checkbox unchecked. Managers can leave notifications OFF. Reply <strong>STOP</strong> to opt out; reply <strong>HELP</strong> to request help. Message frequency varies, and message and data rates may apply.</p>
      <p>Read our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>, including the payment-status SMS section.</p>
    </section>
  </article></main>;
}
