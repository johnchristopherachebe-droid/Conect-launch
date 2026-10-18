// Public Terms and Privacy pages: https://<your-api-domain>/terms and /privacy
//
// BEFORE LAUNCH: edit the three values below, then have a Nigerian lawyer review both pages.
// Anything in [square brackets] is a decision only you can make.
const COMPANY = 'AJC Technologies';                       // your registered business name
const CONTACT_EMAIL = 'conectadmin001@gmail.com';     // a real inbox customers can write to
const UPDATED = 'October 2026';

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${COMPANY}</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#F7F5FB;color:#1B1030;line-height:1.6}
header{background:linear-gradient(#0B0615,#3B1480);color:#fff;padding:28px 20px 22px}
header h1{margin:0;font-size:26px}header p{margin:6px 0 0;color:#D9CCF5;font-size:14px}
main{max-width:760px;margin:0 auto;padding:20px}
section{background:#fff;border:1px solid #E3DBF3;border-radius:16px;padding:6px 20px 14px;margin-bottom:14px}
h2{font-size:18px;color:#2A0F55;margin:16px 0 6px}
li{margin:4px 0}a{color:#7C3AED}
@media (prefers-color-scheme:dark){body{background:#110B1E;color:#F1EDFA}section{background:#1C1430;border-color:#2E2347}h2{color:#D9CCF5}a{color:#A78BFA}}
</style></head><body>
<header><h1>${title}</h1><p>${COMPANY} · Last updated ${UPDATED}</p></header>
<main>${body}
<p style="text-align:center;color:#6B6280;font-size:13px">Questions? Contact us at ${CONTACT_EMAIL}.</p></main></body></html>`;

const terms = `
<section><h2>1. About these terms</h2>
<p>${COMPANY} ("we", "us") runs an app that connects <b>customers</b> with independent <b>vendors</b> (stores, restaurants, pharmacies) and independent <b>riders</b> who deliver orders. By creating an account or using any ${COMPANY} app, you agree to these terms and to our <a href="/privacy">Privacy Policy</a>. If you do not agree, please do not use the app.</p>
<p>You must be at least 18 years old to create an account.</p></section>

<section><h2>2. Your account</h2>
<ul><li>Give accurate information and keep your password private. You are responsible for activity on your account.</li>
<li>You must verify your email address before you can sign in.</li>
<li>We may suspend or close accounts that break these terms, are used for fraud, or put others at risk.</li></ul></section>

<section><h2>3. Orders, prices and payment</h2>
<ul><li>Prices are set by vendors and shown in naira. A delivery fee, based on distance, is shown before you place an order.</li>
<li>Payments are processed securely by <b>Paystack</b>. We never see or store your full card details.</li>
<li>An order is sent to the vendor once payment is confirmed.</li>
<li>Delivery times are estimates, not guarantees.</li></ul></section>

<section><h2>4. Delivery and your delivery PIN</h2>
<ul><li>Each order has a 4-digit delivery PIN shown in your app. Give it to the rider <b>only when your order is in your hands</b>. A delivery is completed when the rider enters the correct PIN.</li>
<li>Please provide a phone number the rider can call, and an address that is accurate and reachable.</li>
<li>If you share your PIN before receiving the order, we may not be able to help you recover it.</li></ul></section>

<section><h2>5. Cancellations and refunds</h2>
<ul><li>You can cancel an order while it is still waiting to be accepted by the vendor. Once a vendor has started preparing it, it cannot be cancelled.</li>
<li>If something is wrong with your order (missing, incorrect or not delivered), contact support from the app within 24 hours. Approved refunds are returned to your original payment method through Paystack, and can take several business days.</li>
<li>In order for a refund to be approved there will ne a thorough investigation.</li></ul></section>

<section><h2>6. Vendors</h2>
<ul><li>Vendors must complete verification before selling: a business profile, a valid government ID, food-safety approval for food businesses, and an in-person orientation with us.</li>
<li>Vendors are responsible for the accuracy of their menus, prices and photos, for food safety and legal compliance, and for preparing orders on time.</li>
<li>Vendors agree to pay ${COMPANY} a commission of 10% on orders, and a vendor's earnings are paid out as described in your payout terms.</li>
<li>We may close a store that breaks these terms or the law.</li></ul></section>

<section><h2>7. Riders</h2>
<ul><li>Riders are independent: they are not our employees. They choose when to go online and which orders to accept.</li>
<li>Riders must complete verification before delivering: a government ID, a driving licence and vehicle registration if they use a motorbike or car, and an in-person orientation.</li>
<li>Riders must deliver orders safely and respectfully, keep customer details private, use them only to complete the delivery, and never complete a delivery without the customer's PIN.</li>
<li>Rider payments are described in your rider payment terms.</li></ul></section>

<section><h2>8. What is not allowed</h2>
<ul><li>Fraud, false orders, misuse of promotions or refunds, or abusing vendors, riders or our staff.</li>
<li>Trying to break, reverse-engineer or overload the app, or accessing other people's accounts.</li>
<li>Ordering or selling anything illegal.</li></ul></section>

<section><h2>9. Our responsibility</h2>
<p>We provide the platform. Vendors prepare the goods and riders deliver them, so we are not the maker of the goods. To the extent the law allows, ${COMPANY} is not liable for indirect losses, or for problems outside our control such as network outages or events beyond our reasonable control. Nothing in these terms limits rights you have under Nigerian law that cannot be limited.</p></section>

<section><h2>10. Changes and contact</h2>
<p>We may update these terms and will update the date above. If you keep using the app after a change, you accept the new terms. These terms are governed by the laws of the Federal Republic of Nigeria. Contact us at ${CONTACT_EMAIL}.</p></section>`;

const privacy = `
<section><h2>1. Who we are</h2>
<p>${COMPANY} is responsible for your personal data in the ${COMPANY} apps. We handle it in line with the Nigeria Data Protection Act 2023. Contact us at ${CONTACT_EMAIL}.</p></section>

<section><h2>2. What we collect</h2>
<ul><li><b>Account details:</b> your name, email, phone number, and a securely stored (hashed) password.</li>
<li><b>Delivery details:</b> saved addresses with their GPS location, delivery notes, and order history.</li>
<li><b>Location:</b> customers' location while using the app, to show nearby stores and save delivery addresses; riders' location while online or delivering; vendors' store location when registering.</li>
<li><b>Verification documents</b> for vendors and riders: government ID, food-safety approval, driving licence and vehicle registration. These are stored encrypted.</li>
<li><b>Support messages</b> you send us, and technical information needed to run the service.</li>
<li><b>Payments:</b> Paystack handles your payment. We keep the payment reference and amount, never your full card details.</li></ul></section>

<section><h2>3. Why we use it</h2>
<ul><li>To create your account, take and deliver orders, and process payments and refunds.</li>
<li>To check vendors and riders before they work with us, and to keep deliveries safe.</li>
<li>To send you account emails, such as verification, and order updates.</li>
<li>To provide support, prevent fraud, and meet our legal obligations.</li></ul></section>

<section><h2>4. Who sees it</h2>
<ul><li><b>Vendors</b> see your name and delivery address for orders you place with them.</li>
<li><b>Riders</b> see your name, phone number, address and delivery note only after they accept your order, and you can see their live location on the map while they deliver.</li>
<li><b>Service providers</b> who help us run the app, including Paystack (payments), Resend (email), Railway (hosting) and, if push notifications are enabled, Google Firebase.</li>
<li>Authorities, where the law requires it.</li>
<li>We do not sell your personal data.</li></ul></section>

<section><h2>5. How long we keep it</h2>
<p>We keep your data while your account is active, and afterwards for as long as needed for accounting, safety, disputes and legal requirements up to 4 years. If you delete your account in the app (Profile → Delete account), we deactivate it and anonymise your profile. Some records, such as transactions, may be kept where the law requires.</p></section>

<section><h2>6. Security</h2>
<p>We protect your data with encryption in transit, hashed passwords, and encrypted storage of verification documents. No system is perfectly secure, so please keep your password and delivery PIN private.</p></section>

<section><h2>7. Your rights</h2>
<p>You can ask to access, correct, delete or receive a copy of your data, to object to or restrict how we use it, and to withdraw consent where we rely on it. Write to ${CONTACT_EMAIL}. If you are not satisfied with our response, you can complain to the Nigeria Data Protection Commission.</p></section>

<section><h2>8. Children</h2>
<p>${COMPANY} is for people aged 18 and over. We do not knowingly collect data from children.</p></section>

<section><h2>9. Changes</h2>
<p>We may update this policy and will change the date above. For major changes, we will tell you in the app or by email.</p></section>`;

export function registerLegal(app) {
  const send = (title, body) => (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(page(title, body));
  };
  app.get('/terms', send('Terms & Conditions', terms));
  app.get('/privacy', send('Privacy Policy', privacy));
}
