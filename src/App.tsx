import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Bell, Check, ChevronRight, Gift, Heart, Home, MapPin, MessageCircle, Package, Paperclip, Phone, Plus, Search, Send, Settings, ShieldCheck, ShoppingBag, Star, Store, User, Wallet, X } from 'lucide-react';
import SignupOnboarding from './SignupOnboarding';
import VerifyAccount from './VerifyAccount';
import LocationPicker from './LocationPicker';
import './brand.css';
import logoIcon from './assets/logo-icon.png';

// PASTE THIS ENTIRE BLOCK HERE

const API_URL = import.meta.env.VITE_API_URL || '';

const getToken = () => localStorage.getItem('conect_token');

const api = {
  async get(path:string, params?:Record<string,string>){
    const url = new URL(API_URL + path, window.location.origin);

    if(params){
      Object.entries(params).forEach(([k,v])=>{
        if(v) url.searchParams.set(k,v);
      });
    }

    const r = await fetch(url.toString(),{
      headers:{
        'Content-Type':'application/json',
        ...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})
      }
    });

    const data = await r.json().catch(()=>({}));

    if(!r.ok){ if((data as any)?.verificationRequired) (window as any).conectOpenVerify?.(); throw { response:{ data } }; }

    return { data };
  },

  async post(path:string, body:any){
    const r = await fetch(API_URL + path,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})
      },
      body:JSON.stringify(body)
    });

    const data = await r.json().catch(()=>({}));

    if(!r.ok){ if((data as any)?.verificationRequired) (window as any).conectOpenVerify?.(); throw { response:{ data } }; }

    return { data };
  },

  async delete(path:string, body:any){
    const r = await fetch(API_URL + path,{
      method:'DELETE',
      headers:{
        'Content-Type':'application/json',
        ...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})
      },
      body:JSON.stringify(body)
    });

    const data = await r.json().catch(()=>({}));

    if(!r.ok){ if((data as any)?.verificationRequired) (window as any).conectOpenVerify?.(); throw { response:{ data } }; }

    return { data };
  },

  async put(path:string, body:any){
    const r = await fetch(API_URL + path,{
      method:'PUT',
      headers:{
        'Content-Type':'application/json',
        ...(getToken()?{Authorization:`Bearer ${getToken()}`}:{})
      },
      body:JSON.stringify(body)
    });

    const data = await r.json().catch(()=>({}));

    if(!r.ok){ if((data as any)?.verificationRequired) (window as any).conectOpenVerify?.(); throw { response:{ data } }; }

    return { data };
  }
};

const auth = {
  async signIn(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw {
        response: {
          data: {
            message: 'Please enter your email and password.'
          }
        }
      };
    }

    const r = await api.post('/api/auth/signin', {
      email: cleanEmail,
      password
    });

    if (!r?.data?.token){
      throw {
        response: {
          data: {
            message: 'Sign-in succeeded but no authentication token was returned.'
          }
        }
      };
    }

    localStorage.setItem('conect_token', r.data.token);

    if (r.data?.user) {
      localStorage.setItem(
        'conect_user',
        JSON.stringify(r.data.user)
      );
    }

    return r;
  },

  async signUp(
    name: string,
    email: string,
    password: string,
    phone: string
  ) {
    const r = await api.post('/api/auth/signup', {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      phone: phone.trim()
    });

    if (!r?.data?.token) {
      throw {
        response: {
          data: {
            message: 'Account was created but no authentication token was returned.'
          }
        }
      };
    }

    localStorage.setItem('conect_token', r.data.token);

    if (r.data?.user) {
      localStorage.setItem(
        'conect_user',
        JSON.stringify(r.data.user)
      );
    }

    return r;
  },

  async getUser() {
    const token = localStorage.getItem('conect_token');

    if (!token) {
      return null;
    }

    const raw = localStorage.getItem('conect_user');

    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem('conect_user');
      return null;
    }
  },

  async signOut() {
    localStorage.removeItem('conect_token');
    localStorage.removeItem('conect_user');
  }
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
const notifications = {
  async subscribe(){
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications are not supported in this browser.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted.');
    }
    const keyRes = await api.get('/api/push/vapid-public-key');
    const publicKey = keyRes.data?.key;
    if (!publicKey) {
      throw new Error('Push notifications are not configured on the server.');
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
    return true;
  }
};
type Role='customer'|'vendor'|'rider'|'admin'|'support'|'dispatch';
type CustomerTab='home'|'orders'|'chat'|'profile';
const money=(n:number)=>`₦${Math.round(n).toLocaleString()}`;
function readFileAsBase64(file: File): Promise<{ base64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      resolve({ base64, contentType: file.type || 'application/octet-stream' });
    };
    reader.readAsDataURL(file);
  });
}
function DocUploadRow({ label, status, uploading, onFile }: { label: string; status?: string; uploading: boolean; onFile: (f: File) => void }) {
  return (
    <div className='addressBox'>
      <div>
        <strong>{label}</strong>
        <small>{status === 'SUBMITTED' ? 'Submitted, awaiting review' : status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Rejected — please re-upload' : 'Not submitted'}</small>
      </div>
      <label className='miniPurple' style={{ cursor: 'pointer' }}>
        {uploading ? 'Uploading...' : status ? 'Replace' : 'Upload'}
        <input type='file' accept='application/pdf,image/jpeg,image/png,image/webp' style={{ display: 'none' }} disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </label>
    </div>
  );
}
function WalletPanel({setNotice}:{setNotice:(s:string)=>void}){const [balance,setBalance]=useState(0);const [banks,setBanks]=useState<{name:string;code:string}[]>([]);const [bank,setBank]=useState({bankCode:'',bankName:'',accountNumber:'',accountName:''});const [bankSaving,setBankSaving]=useState(false);const [bankSaved,setBankSaved]=useState(false);const [amount,setAmount]=useState('');const [requesting,setRequesting]=useState(false);const [history,setHistory]=useState<any[]>([]);const load=async()=>{try{const [w,h]=await Promise.all([api.get('/api/wallet'),api.get('/api/payouts/mine')]);setBalance(Number(w.data?.balance||0));setHistory(h.data.items||[])}catch{}};useEffect(()=>{load();api.get('/api/payouts/banks').then(r=>setBanks(r.data.items||[])).catch(()=>{})},[]);async function saveBank(){if(!bank.bankCode||!bank.accountNumber.trim()||!bank.accountName.trim())return setNotice('Select your bank and enter your account number and name.');setBankSaving(true);try{await api.post('/api/payouts/bank-details',bank);setBankSaved(true);setNotice('Bank details saved and verified.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not save bank details.')}finally{setBankSaving(false)}}async function requestPayout(){const amt=Number(amount);if(!(amt>0))return setNotice('Enter a valid payout amount.');setRequesting(true);try{const r=await api.post('/api/payouts/request',{amount:amt});setBalance(Number(r.data?.walletBalance||0));setAmount('');setNotice('Payout requested and sent for processing.');await load()}catch(e:any){setNotice(e?.response?.data?.message||'Could not request payout.')}finally{setRequesting(false)}}return <section className='darkPanel'><div className='panelTitle'><h2>Wallet</h2><span>{money(balance)}</span></div><div className='formStack'><select className='plainInput' value={bank.bankCode} onChange={e=>{const b=banks.find(x=>x.code===e.target.value);setBank({...bank,bankCode:e.target.value,bankName:b?.name||''})}}><option value=''>Select your bank</option>{banks.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}</select><input className='plainInput' value={bank.accountNumber} onChange={e=>setBank({...bank,accountNumber:e.target.value})} placeholder='Account number'/><input className='plainInput' value={bank.accountName} onChange={e=>setBank({...bank,accountName:e.target.value})} placeholder='Account name'/><button className='purpleBtn small' onClick={saveBank} disabled={bankSaving}>{bankSaving?'Saving...':bankSaved?'Update Bank Details':'Save Bank Details'}</button></div><div className='formStack' style={{marginTop:12}}><input className='plainInput' type='number' value={amount} onChange={e=>setAmount(e.target.value)} placeholder='Amount to withdraw (₦)'/><button className='purpleBtn' onClick={requestPayout} disabled={requesting}>{requesting?'Requesting...':'Request Payout'}</button></div>{history.length>0&&<div style={{marginTop:12}}>{history.map((h:any)=><div className='darkRow' key={h.id}><div><strong>{money(h.amount)}</strong><small>{h.status} · {new Date(h.createdAt).toLocaleDateString()}</small></div></div>)}</div>}</section>}
const categories=[['🍔','Food','#ff9a5a'],['🍰','Pastries','#ff8fb3'],['🥤','Drinks','#5ecbe0'],['🛒','Groceries','#7fd88a'],['🍿','Snacks','#ffd166'],['💊','Pharmacy','#8ea7ff'],['🧴','Essentials','#c792ea'],['•••','More','#b9b3c2']];
export default function App(){
 const [user,setUser]=useState<any>(null),
 [profile,setProfile]=useState<any>(null),
 [role,setRole]=useState<Role>('customer'),
 [screen,setScreen]=useState<'splash'|'welcome'|'app'|'signup'|'verify'>('splash'),
 [customerTab,setCustomerTab]=useState<CustomerTab>('home'),
 [vendorTab,setVendorTab]=useState('dashboard'),
 [riderTab,setRiderTab]=useState('home'),
 [adminTab,setAdminTab]=useState('overview'),
 [cart,setCart]=useState<any[]>([]),
 [search,setSearch]=useState(''),
 [selectedProduct,setSelectedProduct]=useState<any>(null),
 [selectedVendor,setSelectedVendor]=useState<any>(null),
 [temporaryAddress,setTemporaryAddress]=useState(''),
 [useTemp,setUseTemp]=useState(false),
 [notice,setNotice]=useState(''),
 [products,setProducts]=useState<any[]>([]),
 [vendors,setVendors]=useState<any[]>([]),
 [orders,setOrders]=useState<any[]>([]),
 [tickets,setTickets]=useState<any[]>([]),
 [geo,setGeo]=useState<any>(null),
 [deliveryGeo,setDeliveryGeo]=useState<{lat:number;lng:number}|null>(null),
 [walletBalance,setWalletBalance]=useState(0),
 [couponCode,setCouponCode]=useState(''),
 [couponInfo,setCouponInfo]=useState<any>(null),
 [couponError,setCouponError]=useState(''),
 [useWallet,setUseWallet]=useState(false),
 [confirmedOrder,setConfirmedOrder]=useState<any>(null),
 [scheduledFor,setScheduledFor]=useState(''),
 [paymentMethod,setPaymentMethod]=useState('paystack');

 const [onboarding,setOnboarding]=useState({
   name:'',
   phone:'',
   email:'',
   role:'customer',
   homeAddress:'',
   username:'',
   password:'',
   termsAccepted:false
 });

  const [theme,setTheme]=useState<'dark'|'light'>(
  () => (localStorage.getItem('conect-theme') as 'dark'|'light') || 'dark'
);

const [booted,setBooted]=useState(false);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('conect-theme',theme)},[theme]);useEffect(()=>{(window as any).conectOpenVerify=()=>setScreen('verify')},[]);useEffect(() => {
  let cancelled = false;

  async function startApp() {
    try {
      await boot(false);
    } finally {
      if (!cancelled) {
        setBooted(true);
      }
    }
  }

  startApp();

  return () => {
    cancelled = true;
  };
}, []);

async function boot(fromLogin = false) {
  try {
    const verifyParams = new URLSearchParams(window.location.search);
    const verifyEmailToken = verifyParams.get('verifyEmail');

    if (verifyEmailToken) {
      try {
        await api.post('/api/auth/verify-email', { token: verifyEmailToken });
        setNotice('Your email address has been verified.');
      } catch (e: any) {
        setNotice(e?.response?.data?.message || 'This verification link is invalid or has expired.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem('conect_token');

    /*
     * No token means the user is not authenticated.
     * Show the welcome screen.
     */
    if (!token) {
      setUser(null);
      setProfile(null);
      setRole('customer');

      if (!fromLogin) {
        setScreen('welcome');
      }

      return;
    }

    /*
     * Always ask the backend who the currently
     * authenticated user is.
     *
     * This prevents an old/stale localStorage user
     * from determining the user's role.
     */
    const me = await api.get('/api/me');

    const currentUser = me.data?.user || me.data?.profile?.user || null;
    const currentProfile = me.data?.profile || null;

    if (!currentUser && !currentProfile) {
      throw new Error('Authentication session is invalid.');
    }

    const storedUserRaw = localStorage.getItem('conect_user');
    let mergedUser = currentUser;
    try {
      const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
      mergedUser = {
        ...(storedUser || {}),
        ...(currentUser || {}),
        emailVerified: Boolean(me.data?.emailVerified),
        phoneVerified: Boolean(me.data?.phoneVerified),
        phone: me.data?.phone || storedUser?.phone || currentUser?.phone || ''
      };
    } catch {}

    if (mergedUser) {
      setUser(mergedUser);
      localStorage.setItem(
        'conect_user',
        JSON.stringify(mergedUser)
      );
    }

    setProfile(currentProfile);

    const currentRole: Role =
      currentProfile?.role ||
      currentUser?.role ||
      'customer';

    setRole(currentRole);

    /*
     * Every user must verify their email and phone number
     * before using the app. The backend enforces this on every
     * request too, but we route here first to avoid a burst of
     * failed calls and a confusing blank/broken app screen.
     */
    if (!mergedUser?.emailVerified || !mergedUser?.phoneVerified) {
      setScreen('verify');
      return;
    }

    /*
     * Authentication is successful.
     * Only now enter the application.
     */
    setScreen('app');

    /*
     * Payment callback handling.
     */
    const params = new URLSearchParams(
      window.location.search
    );

    const ref = params.get('reference');

    if (
      params.get('payment') === 'callback' &&
      ref
    ) {
      try {
        const vr = await api.post(
          '/api/payment/verify',
          {
            reference: ref
          }
        );

        setNotice(
          vr.data?.paid
            ? 'Payment successful. Your order is confirmed.'
            : 'Payment could not be verified.'
        );

        if (vr.data?.paid && vr.data?.order) {
          setConfirmedOrder(vr.data.order);
        }

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

      } catch (e: any) {
        setNotice(
          e?.response?.data?.message ||
          'Payment verification failed.'
        );
      }
    }

    if (currentRole === 'customer') {
      try {
        const [pr, vr] = await Promise.all([api.get('/api/products'), api.get('/api/vendors')]);
        setProducts(pr.data?.items || []);
        setVendors(vr.data?.items || []);
      } catch {
        setProducts([]);
        setVendors([]);
      }
    }

    /*
     * Load the user's orders.
     */
    try {
      const o = await api.get('/api/orders');
      setOrders(o.data?.items || []);
    } catch {
      setOrders([]);
    }

    /*
     * Support users need their support tickets.
     */
    if (currentRole === 'support') {
      try {
        const q = await api.get(
          '/api/support/tickets'
        );

        setTickets(q.data?.items || []);
      } catch {
        setTickets([]);
      }
    }

    /*
     * Customers can carry a gift/wallet credit balance
     * awarded by an admin, applicable at checkout.
     */
    if (currentRole === 'customer') {
      try {
        const w = await api.get('/api/wallet');
        setWalletBalance(Number(w.data?.balance || 0));
      } catch {
        setWalletBalance(0);
      }
    }

  } catch (e: any) {

    /*
     * The token exists but the backend rejected it.
     * Clear the invalid session completely.
     */
    await auth.signOut();

    setUser(null);
    setProfile(null);
    setRole('customer');

    setScreen('welcome');

    if (fromLogin) {
      setNotice(
        e?.response?.data?.message ||
        e?.message ||
        'Your sign-in session could not be created.'
      );
    }
  }
}
async function signIn(email: string, password: string) {
  try {
    setNotice('');

    const r = await auth.signIn(email, password);

    if (!r?.data?.token) {
      throw new Error('No authentication token was returned.');
    }

    setUser(r.data?.user || null);

    await boot(true);

  } catch (e: any) {
    setNotice(
      e?.response?.data?.message ||
      e?.message ||
      'Sign-in failed. Please check your email and password.'
    );

    throw e;
  }
}
async function finishSignup(){
  const name = onboarding.name.trim();
  const phone = onboarding.phone.trim();
  const email = onboarding.email.trim().toLowerCase();
  const password = onboarding.password;

  if (!name) {
    return setNotice('Enter your full name.');
  }

  if (phone.length < 7) {
    return setNotice('Enter a valid phone number.');
  }

  if (!email || !email.includes('@')) {
    return setNotice('Enter a valid email address.');
  }

  if (password.length < 8) {
    return setNotice('Password must be at least 8 characters.');
  }

  if (!onboarding.termsAccepted) {
    return setNotice('Please agree to the Terms & Conditions and Privacy Policy.');
  }

  try {
    setNotice('');

    const r = await auth.signUp(
      name,
      email,
      password,
      phone
    );

    setUser(r.data?.user || null);

    const profileResult = await api.post(
      '/api/profile/onboarding',
      {
        name,
        phone,
        email,
        username: onboarding.username,
        role: onboarding.role,
        homeAddress: onboarding.homeAddress
      }
    );

    if (profileResult.data?.profile) {
      setProfile(profileResult.data.profile);
      setRole(profileResult.data.profile.role || onboarding.role);
    }

    await boot(true);

  } catch (e:any) {
    setNotice(
      e?.response?.data?.message ||
      e?.message ||
      'Account creation failed.'
    );
  }
}
 async function signOut(){await auth.signOut();setUser(null);setProfile(null);setScreen('welcome')}
 function addToCart(p:any){setCart(c=>[...c,p]);setNotice(`${p.name} added to cart.`)}
 async function checkout(){
  if(!cart.length) return;
  const address = useTemp ? temporaryAddress : profile?.homeAddress;
  if(!address) return setNotice('Add a delivery address first.');
  if(!deliveryGeo) return setNotice('Set your exact delivery location on the map first.');

  try {
    const r = await api.post('/api/orders', {
      items: cart,
      deliveryAddress: address,
      customerLat: deliveryGeo.lat,
      customerLng: deliveryGeo.lng,
      couponCode: couponInfo ? couponCode.trim() : '',
      useWallet,
      scheduledFor: scheduledFor || undefined,
      paymentMethod: paymentMethod || undefined
    });

    setOrders(o => [r.data.order, ...o]);
    setCart([]);
    setCustomerTab('orders');
    setCouponCode('');
    setCouponInfo(null);
    setCouponError('');
    setScheduledFor('');
    setPaymentMethod('paystack');

    if (r.data.order.paymentMethod === 'cod') {
      setNotice('Order placed! Pay your rider in cash on delivery.');
      setConfirmedOrder(r.data.order);
      return;
    }

    setNotice('Order created. Starting secure Paystack checkout...');

    const pay = await api.post('/api/payment/initialize', { orderId: r.data.order.id });

    if (pay.data?.free || pay.data?.alreadyPaid) {
      setUseWallet(false);
      if (role === 'customer') {
        try {
          const w = await api.get('/api/wallet');
          setWalletBalance(Number(w.data?.balance || 0));
        } catch {}
      }
      setNotice(pay.data?.alreadyPaid ? 'This order was already paid for. Payment confirmed!' : 'Order fully covered by coupon/wallet credit. Payment confirmed!');
      setConfirmedOrder(pay.data?.order || r.data.order);
      return;
    }

    window.location.href = pay.data.authorization_url;
  } catch(e: any) {
  console.error('CHECKOUT ERROR:', e);
  setNotice(
    e?.response?.data?.message ||
    e?.message ||
    'Checkout could not be started.'
  );
}
}
async function applyCoupon() {
  const code = couponCode.trim();
  if (!code) return setCouponError('Enter a coupon code.');
  const subtotal = cart.reduce((s: number, p: any) => s + p.price, 0);
  try {
    setCouponError('');
    const r = await api.post('/api/coupons/validate', { code, subtotal });
    setCouponInfo(r.data);
    setNotice('Coupon applied.');
  } catch (e: any) {
    setCouponInfo(null);
    setCouponError(e?.response?.data?.message || 'Invalid coupon code.');
  }
}
 
async function becomeRole(nextRole: string) {
  try {
    const r = await api.post('/api/role-request', { role: nextRole });
    setNotice(r.data?.message || 'Request submitted.');
    await boot(true);
  } catch (e: any) {
    setNotice(e?.response?.data?.message || 'Could not submit request.');
  }
}
 const visible=useMemo(()=>products.filter(p=>`${p.name} ${p.vendor} ${p.category}`.toLowerCase().includes(search.toLowerCase())),[products,search]);
if (!booted) {
  return <Splash />;
}

if (screen === 'signup') {
  return (
    <SignupOnboarding
      user={user}
      onboarding={onboarding}
      setOnboarding={setOnboarding}
      completeSignup={finishSignup}
      signOut={signOut}
    />
  );
}

if (screen === 'verify') {
  return (
    <VerifyAccount
      user={user}
      api={api}
      notice={notice}
      setNotice={setNotice}
      onDone={async () => { await boot(true); }}
      signOut={signOut}
    />
  );
}

if (screen === 'welcome') {
  return (
    <Welcome
      signIn={signIn}
      getStarted={() => setScreen('signup')}
      notice={notice}
      setNotice={setNotice}
      portal={new URLSearchParams(window.location.search).get('portal')}
    />
  );
}
 if(role==='vendor')return <VendorApp profile={profile} tab={vendorTab} setTab={setVendorTab} notice={notice} setNotice={setNotice} theme={theme} setTheme={setTheme} signOut={signOut}/>;if(role==='rider')return <RiderApp profile={profile} tab={riderTab} setTab={setRiderTab} notice={notice} setNotice={setNotice} theme={theme} setTheme={setTheme} signOut={signOut}/>;if(role==='admin')return (
 <AdminControlApp
  tab={adminTab}
  setTab={setAdminTab}
  notice={notice}
  setNotice={setNotice}
  signOut={signOut}
  theme={theme}
  setTheme={setTheme}
/>
);
if(role==='support')return <SupportCenterApp tickets={tickets} notice={notice} setNotice={setNotice} theme={theme} setTheme={setTheme} signOut={signOut}/>;
if(role==='dispatch')return <DispatchApp notice={notice} setNotice={setNotice} theme={theme} setTheme={setTheme} signOut={signOut}/>;
return <CustomerApp profile={profile} setProfile={setProfile} vendors={vendors} tab={customerTab} setTab={setCustomerTab} products={visible} cart={cart} setCart={setCart} addToCart={addToCart} search={search} setSearch={setSearch} selectedProduct={selectedProduct} setSelectedProduct={setSelectedProduct} selectedVendor={selectedVendor} setSelectedVendor={setSelectedVendor} orders={orders} checkout={checkout} setUseTemp={setUseTemp} setTemporaryAddress={setTemporaryAddress} deliveryGeo={deliveryGeo} setDeliveryGeo={setDeliveryGeo} geo={geo} notice={notice} setNotice={setNotice} signOut={signOut} theme={theme} setTheme={setTheme} walletBalance={walletBalance} couponCode={couponCode} setCouponCode={setCouponCode} couponInfo={couponInfo} couponError={couponError} applyCoupon={applyCoupon} useWallet={useWallet} setUseWallet={setUseWallet} becomeRole={becomeRole} confirmedOrder={confirmedOrder} onDismissConfirm={()=>setConfirmedOrder(null)} scheduledFor={scheduledFor} setScheduledFor={setScheduledFor} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}/>;
}
function Splash(){return <div className='splashScreen'><div className='splashGlow'/><div className='splashLogo'><LogoMark/><strong>cönëct</strong></div><div className='splashTag'>Order <i/> Track <i/> Receive</div><div className='splashSubtag'>Food <i/> Groceries <i/> Essentials <i/> More</div><div className='splashLoader'><span/><span/><span/><span/></div></div>}
function LogoMark({className}:{className?:string}={}){return <img src={logoIcon} alt="cönëct" className={'logoMark'+(className?' '+className:'')}/>}
const PORTAL_CONFIG: Record<string, any> = {
  admin: { emoji: '🖥️', title: 'Admin Sign In', subtitle: 'Welcome back!', footer: 'Secure access only', internal: true },
  support: { emoji: '🎧', title: 'Support Sign In', subtitle: "We're here to help you and our users.", footer: 'Help. Solve. Smile.', internal: true },
  vendor: { emoji: '🍳', title: 'Vendor Sign In', subtitle: 'Welcome back!', footer: 'Trusted by vendors everywhere', internal: false },
  rider: { emoji: '🏍️', title: 'Rider Sign In', subtitle: 'Welcome back!', footer: null, internal: false },
};
function Welcome({
  signIn,
  getStarted,
  notice,
  setNotice,
  portal
}: any) {
  const cfg = PORTAL_CONFIG[portal] || null;
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setNotice('Please enter your email.');
      return;
    }

    if (!password) {
      setNotice('Please enter your password.');
      return;
    }

    setLoading(true);
    setNotice('');

    try {
      await signIn(email, password);
    } catch (e: any) {
      setNotice(
        e?.response?.data?.message ||
        e?.message ||
        'Unable to sign in. Please check your email and password.'
      );
    } finally {
      setLoading(false);
    }
  }

  if (showLogin) {
    return (
      <div className='welcomeScreen'>
        <div className='welcomeVisual'>
          <div className='welcomeOrb'>
            <LogoMark />
            <b>cönëct</b>
          </div>

          <div className='riderArt'>{cfg?.emoji || '🏍️'}</div>
        </div>

        <div className='welcomeCopy'>
          <button
            className='circleBtn'
            type='button'
            onClick={() => {
              setShowLogin(false);
              setNotice('');
            }}
            style={{
              marginBottom: 18,
              alignSelf: 'flex-start'
            }}
          >
            <ArrowLeft size={18} />
          </button>

          <div className='miniBrand'>
            <LogoMark />
            <b>cönëct</b>
          </div>

          <h1>
            {cfg ? cfg.title : (<>Welcome<br /><em>back.</em></>)}
          </h1>

          <p>
            {cfg ? cfg.subtitle : 'Sign in to continue to your cönëct account.'}
          </p>

          <form
            onSubmit={handleSignIn}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div className='formStack'>
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <small>Email</small>

                <input
                  className='plainInput'
                  type='email'
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder='Enter your email'
                  autoComplete='email'
                  disabled={loading}
                  autoFocus
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  position: 'relative'
                }}
              >
                <small>Password</small>

                <div
                  style={{
                    position: 'relative',
                    width: '100%'
                  }}
                >
                  <input
                    className='plainInput'
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder='Enter your password'
                    autoComplete='current-password'
                    disabled={loading}
                    style={{
                      width: '100%',
                      paddingRight: 70
                    }}
                  />

                  <button
                    type='button'
                    onClick={() =>
                      setShowPassword(v => !v)
                    }
                    disabled={loading}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
            </div>

            <button
              className='purpleBtn wide'
              type='submit'
              disabled={loading}
              style={{
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <button
            type='button'
            className='outlineBtn wide'
            onClick={getStarted}
            disabled={loading}
            style={{ marginTop: 10, display: cfg?.internal ? 'none' : undefined }}
          >
            Create an Account
          </button>

          <div className='tagline'>
            {cfg?.footer ? cfg.footer : (<>Order <i /> Track <i /> Receive</>)}
          </div>
        </div>

        {notice && (
          <Toast
            text={notice}
            close={() => setNotice('')}
          />
        )}
      </div>
    );
  }

  return (
    <div className='welcomeScreen'>
      <div className='welcomeVisual'>
        <div className='welcomeOrb'>
          <LogoMark />
          <b>cönëct</b>
        </div>

        <div className='riderArt'>{cfg?.emoji || '🏍️'}</div>
      </div>

      <div className='welcomeCopy'>
        <div className='miniBrand'>
          <LogoMark />
          <b>cönëct</b>
        </div>

        <h1>
          {cfg ? cfg.title : (<>Anything you need,<br /><em>anywhere you are.</em></>)}
        </h1>

        <p>
          {cfg ? cfg.subtitle : 'Food · Groceries · Essentials · More'}
        </p>

        {!cfg?.internal && (
          <button
            className='purpleBtn wide'
            onClick={getStarted}
          >
            Get Started
            <ArrowRight size={17} />
          </button>
        )}

        <button
          className='outlineBtn wide'
          onClick={() => {
            setShowLogin(true);
            setNotice('');
          }}
        >
          Sign In
        </button>

        <div className='tagline'>
          Order <i /> Track <i /> Receive
        </div>
      </div>

      {notice && (
        <Toast
          text={notice}
          close={() => setNotice('')}
        />
      )}
    </div>
  );
}
function TopBar({title,onBack,cartCount,unread,onBell}:any){const [notifyOn,setNotifyOn]=useState(false);async function enable(){try{await notifications.subscribe();setNotifyOn(true)}catch(e:any){alert(e?.message||'Could not enable notifications.')}}return <header className='mobileTop'>{onBack?<button className='circleBtn' onClick={onBack}><ArrowLeft size={18}/></button>:<div className='miniBrand'><LogoMark/><b>cönëct</b></div>}<div className='topTitle'>{title}</div><div className='topActions'><button className='circleBtn' onClick={()=>{enable();onBell?.()}} title={notifyOn?'Notifications enabled':'Enable notifications'} style={{position:'relative'}}><Bell size={18}/>{unread>0&&<i className='navDot' style={{position:'absolute',top:-2,right:-2}}>{unread}</i>}</button>{cartCount>0&&<span className='cartBadge'>{cartCount}</span>}</div></header>}
function CustomerApp({profile,setProfile,tab,setTab,products,vendors,cart,setCart,addToCart,search,setSearch,selectedProduct,setSelectedProduct,selectedVendor,setSelectedVendor,orders,checkout,setUseTemp,setTemporaryAddress,deliveryGeo,setDeliveryGeo,geo,notice,setNotice,signOut,theme,setTheme,walletBalance,couponCode,setCouponCode,couponInfo,couponError,applyCoupon,useWallet,setUseWallet,becomeRole,confirmedOrder,onDismissConfirm,scheduledFor,setScheduledFor,paymentMethod,setPaymentMethod}:any){const [cat,setCat]=useState('All');const filtered=cat==='All'?products:products.filter((p:any)=>p.category===cat);const [showCart,setShowCart]=useState(false);const [sub,setSub]=useState('');const [saved,setSaved]=useState<any[]>([]);const [unread,setUnread]=useState(0);const [showHomePicker,setShowHomePicker]=useState(false);const loadSaved=async()=>{try{const r=await api.get('/api/profile/settings');setSaved(r.data.savedItems||[])}catch{}};useEffect(()=>{loadSaved()},[]);useEffect(()=>{const loadUnread=async()=>{try{const r=await api.get('/api/notifications');setUnread((r.data.items||[]).filter((n:any)=>!n.read).length)}catch{}};loadUnread();const t=window.setInterval(loadUnread,30000);return()=>window.clearInterval(t)},[]);function savedEntryFor(productId:string){return saved.find((s:any)=>s.productId===productId)}async function toggleFavorite(productId:string){const existing=savedEntryFor(productId);try{if(existing){await api.delete('/api/profile/saved',{id:existing.id})}else{await api.post('/api/profile/saved',{productId})}await loadSaved()}catch(e:any){setNotice(e?.response?.data?.message||'Could not update favorites.')}}function savedVendorEntryFor(vendorUserId:string){return saved.find((s:any)=>s.vendorUserId===vendorUserId)}async function toggleVendorFavorite(vendorUserId:string){const existing=savedVendorEntryFor(vendorUserId);try{if(existing){await api.delete('/api/profile/saved',{id:existing.id})}else{await api.post('/api/profile/saved',{vendorUserId})}await loadSaved()}catch(e:any){setNotice(e?.response?.data?.message||'Could not update favorites.')}}async function confirmHomeLocation(loc:{lat:number;lng:number;address:string}){try{const r=await api.post('/api/profile/home-location',{homeAddress:loc.address,lat:loc.lat,lng:loc.lng});setProfile(r.data.profile);setDeliveryGeo({lat:loc.lat,lng:loc.lng});setShowHomePicker(false);setNotice('Delivery location updated.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not save location.');setShowHomePicker(false)}}if(showHomePicker)return <LocationPicker api={api} initialLat={profile?.homeLat??geo?.lat} initialLng={profile?.homeLng??geo?.lng} onConfirm={confirmHomeLocation} onCancel={()=>setShowHomePicker(false)}/>;
if(confirmedOrder)return <OrderConfirmedScreen order={confirmedOrder} onTrack={()=>{onDismissConfirm();setTab('orders')}} onHome={()=>{onDismissConfirm();setTab('home')}}/>;
if(selectedProduct)return <ProductDetail product={selectedProduct} back={()=>setSelectedProduct(null)} add={()=>addToCart(selectedProduct)} cartCount={cart.length} favorited={Boolean(savedEntryFor(selectedProduct.id))} onFavorite={()=>toggleFavorite(selectedProduct.id)}/>;
if(selectedVendor)return <VendorDetail vendor={selectedVendor} products={products} back={()=>setSelectedVendor(null)} add={addToCart} cartCount={cart.length} favorited={Boolean(savedVendorEntryFor(selectedVendor.userId))} onFavorite={()=>toggleVendorFavorite(selectedVendor.userId)}/>;
if(showCart&&sub==='checkout')return <CheckoutFlow cart={cart} back={()=>setSub('')} checkout={()=>{setShowCart(false);setSub('');checkout()}} couponCode={couponCode} setCouponCode={setCouponCode} couponInfo={couponInfo} couponError={couponError} applyCoupon={applyCoupon} walletBalance={walletBalance} useWallet={useWallet} setUseWallet={setUseWallet} setTemporaryAddress={setTemporaryAddress} setUseTemp={setUseTemp} homeAddress={profile?.homeAddress} homeLat={profile?.homeLat} homeLng={profile?.homeLng} deliveryGeo={deliveryGeo} setDeliveryGeo={setDeliveryGeo} setNotice={setNotice} scheduledFor={scheduledFor} setScheduledFor={setScheduledFor} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}/>;
if(showCart)return <CartScreen cart={cart} setCart={setCart} back={()=>setShowCart(false)} checkout={()=>setSub('checkout')} couponCode={couponCode} setCouponCode={setCouponCode} couponInfo={couponInfo} couponError={couponError} applyCoupon={applyCoupon}/>;
if(sub==='restaurants')return <RestaurantsScreen vendors={vendors} back={()=>setSub('')} onOpen={(v:any)=>{setSub('');setSelectedVendor(v)}} savedVendorEntryFor={savedVendorEntryFor} toggleVendorFavorite={toggleVendorFavorite}/>;
if(sub==='addresses')return <AddressesScreen back={()=>setSub('')} setNotice={setNotice}/>;
if(sub==='payments')return <PaymentMethodsScreen back={()=>setSub('')} setNotice={setNotice}/>;
if(sub==='wallet')return <CustomerWalletScreen back={()=>setSub('')} orders={orders}/>;
if(sub==='help')return <HelpScreen back={()=>setSub('')} onContact={()=>{setSub('');setTab('chat')}}/>;
if(sub==='settings')return <SettingsScreen back={()=>setSub('')} theme={theme} setTheme={setTheme} signOut={signOut} setNotice={setNotice}/>;
if(sub==='grow')return <GrowScreen back={()=>setSub('')} becomeRole={becomeRole}/>;
if(tab==='orders')return <OrdersScreen orders={orders} back={()=>setTab('home')} myUserId={profile?.userId}/>;
if(tab==='chat')return <ChatScreen back={()=>setTab('home')}/>;
if(tab==='notifications')return <NotificationsScreen back={()=>setTab('home')}/>;
if(tab==='favorites')return <FavoritesScreen saved={saved} products={products} vendors={vendors} back={()=>setTab('profile')} onOpen={(p:any)=>setSelectedProduct(p)} onRemove={(productId:string)=>toggleFavorite(productId)} onOpenVendor={(v:any)=>{setTab('home');setSelectedVendor(v)}} onRemoveVendor={(vendorUserId:string)=>toggleVendorFavorite(vendorUserId)}/>;
if(tab==='profile')return <ProfileScreen profile={profile} signOut={signOut} back={()=>setTab('home')} savedCount={saved.length} onNav={(s:string)=>s==='favorites'?setTab('favorites'):setSub(s)}/>;
return <div className='phoneApp'><TopBar title='' cartCount={cart.length} unread={unread} onBell={()=>setTab('notifications')}/><main className='customerBody'><div className='deliverRow'><div onClick={()=>setShowHomePicker(true)} style={{cursor:'pointer'}}><small>Deliver to</small><b><MapPin size={14}/> {profile?.homeAddress||'UNIZIK, Awka'}⌄</b></div><button className='circleBtn' onClick={()=>setShowHomePicker(true)}><MapPin size={17}/></button></div><div className='searchInput'><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search for food, pastries, groceries...'/></div><section className='promoCard'><div><strong>Delicious meals,<br/>fast delivery!</strong><p>From your favorite vendors to your doorstep.</p><button className='purpleBtn small' onClick={()=>setCat('Food')}>Order Now</button></div><div className='promoFood'>🍗</div></section><div className='categoryGrid'>{categories.map(([icon,label,color])=><button key={label} onClick={()=>setCat(label==='More'?'All':label)} className={cat===label?'cat active':'cat'}><span style={{background:cat===label?undefined:color as string}}>{icon}</span><small>{label}</small></button>)}</div><section className='sectionHead'><h2>Popular Near You</h2><button onClick={()=>setCat('All')}>See all</button></section><div className='productGrid'>{filtered.map((p:any)=><ProductCard key={p.id} p={p} onOpen={()=>setSelectedProduct(p)} onAdd={()=>addToCart(p)} favorited={Boolean(savedEntryFor(p.id))} onFavorite={()=>toggleFavorite(p.id)}/>)}</div><section className='sectionHead'><h2>Restaurants Near You</h2><button onClick={()=>setSub('restaurants')}>See all</button></section>{vendors?.length ? vendors.slice(0,5).map((v:any)=><div className='vendorCard' key={v.userId||v.id} onClick={()=>setSelectedVendor(v)}><div className='vendorLogo'>{String(v.businessName||v.name||'V').slice(0,2).toUpperCase()}</div><div><strong>{v.businessName||v.name}</strong><span><Star size={12} fill='currentColor'/> {v.rating||'New'} · {v.eta||'Available'}</span><small>{v.category||'Vendor'} · {v.address||'Delivery available'}</small></div><button className='circleBtn' onClick={e=>{e.stopPropagation();toggleVendorFavorite(v.userId)}}><Heart size={15} fill={savedVendorEntryFor(v.userId)?'currentColor':'none'}/></button><ChevronRight size={18}/></div>) : <div className='emptyState'>No verified vendors are available yet.</div>}</main><CustomerNav tab={tab} setTab={setTab} cartCount={cart.length} onCart={()=>setShowCart(true)}/>{notice&&<Toast text={notice} close={()=>setNotice('')}/>}</div>}
function CustomerNav({tab,setTab,cartCount,onCart}:any){return <nav className='bottomNav'><button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Home size={19}/><span>Home</span></button><button onClick={onCart}><ShoppingBag size={19}/>{cartCount>0&&<i className='navDot'>{cartCount}</i>}<span>Orders</span></button><button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}><MessageCircle size={19}/><span>Chat</span></button><button className={tab==='profile'?'active':''} onClick={()=>setTab('profile')}><User size={19}/><span>Profile</span></button></nav>}
function ProductCard({p,onOpen,onAdd,favorited,onFavorite}:any){return <article className='foodCard' onClick={onOpen}><div className='foodImage'>{p.imageUrls?.[0]?<img src={p.imageUrls[0]} alt={p.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<span>{p.emoji||'🍽️'}</span>}{onFavorite&&<button onClick={e=>{e.stopPropagation();onFavorite()}} className='plusBtn' style={{left:8,right:'auto'}} aria-label='Favorite'><Heart size={15} fill={favorited?'currentColor':'none'}/></button>}<button onClick={e=>{e.stopPropagation();onAdd()}} className='plusBtn'><Plus size={16}/></button></div><div className='foodInfo'><strong>{p.name}</strong><small>{p.vendor} · <Star size={10} fill='currentColor'/> {p.rating||4.8}</small><b>{money(p.price)}</b></div></article>}
function FavoritesScreen({saved,products,vendors,back,onOpen,onRemove,onOpenVendor,onRemoveVendor}:any){const items=saved.filter((s:any)=>s.productId).map((s:any)=>({...s,product:products.find((p:any)=>p.id===s.productId)})).filter((s:any)=>s.product);const vendorItems=saved.filter((s:any)=>s.vendorUserId).map((s:any)=>({...s,vendor:(vendors||[]).find((v:any)=>v.userId===s.vendorUserId)})).filter((s:any)=>s.vendor);return <div className='phoneApp'><TopBar title='Favorites' onBack={back}/><main className='detailBody'>{!items.length&&!vendorItems.length&&<div className='emptyState'>You haven't saved any favorites yet.</div>}{vendorItems.length>0&&<><div className='panelTitle'><h2>Vendors</h2></div>{vendorItems.map((s:any)=><div className='vendorCard' key={s.id} onClick={()=>onOpenVendor(s.vendor)}><div className='vendorLogo'>{String(s.vendor.businessName||s.vendor.name||'V').slice(0,2).toUpperCase()}</div><div><strong>{s.vendor.businessName||s.vendor.name}</strong><span><Star size={12} fill='currentColor'/> {s.vendor.rating||'New'}</span></div><button className='circleBtn' onClick={e=>{e.stopPropagation();onRemoveVendor(s.vendorUserId)}}><Heart size={15} fill='currentColor'/></button></div>)}</>}{items.length>0&&<><div className='panelTitle' style={{marginTop:vendorItems.length?16:0}}><h2>Products</h2></div><div className='productGrid'>{items.map((s:any)=><ProductCard key={s.id} p={s.product} onOpen={()=>onOpen(s.product)} onAdd={()=>onOpen(s.product)} favorited={true} onFavorite={()=>onRemove(s.productId)}/>)}</div></>}</main></div>}
function CheckoutFlow({cart,back,checkout,couponCode,setCouponCode,couponInfo,couponError,applyCoupon,walletBalance,useWallet,setUseWallet,setTemporaryAddress,setUseTemp,homeAddress,homeLat,homeLng,deliveryGeo,setDeliveryGeo,setNotice,scheduledFor,setScheduledFor,paymentMethod,setPaymentMethod}:any){
  const [step,setStep]=useState(1);
  const [addresses,setAddresses]=useState<any[]>([]);
  const [selected,setSelected]=useState('');
  const [selectedGeo,setSelectedGeo]=useState<{lat:number;lng:number}|null>(deliveryGeo||null);
  const [showPicker,setShowPicker]=useState(false);
  const [scheduleMode,setScheduleMode]=useState(scheduledFor?'LATER':'ASAP');

  useEffect(()=>{
    api.get('/api/profile/settings').then(r=>{
      const items=r.data.addresses||[];
      setAddresses(items);
      const def=items.find((a:any)=>a.isDefault)||items[0];
      if(def){
        setSelected(def.address);
        if(Number.isFinite(def.lat)&&Number.isFinite(def.lng))setSelectedGeo({lat:def.lat,lng:def.lng});
      }
    }).catch(()=>{});
  },[]);

  const subtotal=cart.reduce((s:number,p:any)=>s+p.price,0);
  const discount=couponInfo?.discount||0;
  const afterDiscount=Math.max(0,subtotal-discount);
  const walletApplied=useWallet?Math.min(walletBalance||0,afterDiscount):0;
  const estTotal=Math.max(0,afterDiscount-walletApplied);
  const minSchedule=new Date(Date.now()+31*60*1000).toISOString().slice(0,16);
  const maxSchedule=new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,16);

  function selectAddress(a:any){
    setSelected(a.address);
    setSelectedGeo(Number.isFinite(a.lat)&&Number.isFinite(a.lng)?{lat:a.lat,lng:a.lng}:null);
  }
  function selectHome(){
    setSelected(homeAddress);
    setSelectedGeo(Number.isFinite(homeLat)&&Number.isFinite(homeLng)?{lat:homeLat,lng:homeLng}:null);
  }

  async function onPickNewLocation(loc:{lat:number;lng:number;address:string}){
    setShowPicker(false);
    try{
      await api.post('/api/profile/address',{label:'Address',address:loc.address,lat:loc.lat,lng:loc.lng});
      setSelected(loc.address);
      setSelectedGeo({lat:loc.lat,lng:loc.lng});
      const r=await api.get('/api/profile/settings');
      setAddresses(r.data.addresses||[]);
    }catch(e:any){
      setNotice(e?.response?.data?.message||'Could not save address.');
    }
  }

  async function onPinExistingAddress(loc:{lat:number;lng:number;address:string}){
    setShowPicker(false);
    setSelectedGeo({lat:loc.lat,lng:loc.lng});
    try{
      if(selected===homeAddress){
        await api.post('/api/profile/home-location',{homeAddress:selected,lat:loc.lat,lng:loc.lng});
      } else {
        const match=addresses.find((a:any)=>a.address===selected);
        if(match)await api.post('/api/profile/address',{label:match.label,address:selected,lat:loc.lat,lng:loc.lng});
      }
    }catch{
      // the pin is still applied locally for this order even if saving it back fails
    }
  }

  function goReview(){
    const addr=selected||homeAddress;
    if(!addr)return setNotice('Add a delivery address first.');
    if(!selectedGeo)return setNotice('Set your exact delivery location on the map first.');
    setTemporaryAddress(addr);
    setUseTemp(true);
    setDeliveryGeo(selectedGeo);
    setStep(3);
  }
  function continueStep1(){
    if(!selected&&!homeAddress)return setNotice('Add a delivery address first.');
    if(!selectedGeo)return setNotice('Set your exact delivery location on the map to continue.');
    if(scheduleMode==='LATER'&&!scheduledFor)return setNotice('Pick a delivery date and time.');
    if(scheduleMode==='ASAP')setScheduledFor('');
    setStep(2);
  }

  if(showPicker)return <LocationPicker api={api} initialLat={selectedGeo?.lat} initialLng={selectedGeo?.lng} onConfirm={selected?onPinExistingAddress:onPickNewLocation} onCancel={()=>setShowPicker(false)}/>;

  return <div className='phoneApp'><TopBar title='Checkout' onBack={step===1?back:()=>setStep(step-1)}/><main className='detailBody'>
    <div className='stepper'><span className={step>=1?'on':''}>1<i/>Address</span><span className={step>=2?'on':''}>2<i/>Payment</span><span className={step>=3?'on':''}>3<i/>Review</span></div>
    {step===1&&<>
      <h2>Delivery Address</h2>
      {addresses.map((a:any)=><label className='radioRow' key={a.id}><input type='radio' checked={selected===a.address} onChange={()=>selectAddress(a)}/><div><strong>{a.label}</strong><small>{a.address}</small>{selected===a.address&&!Number.isFinite(a.lat)&&<small style={{color:'#e5484d',display:'block'}}>No exact location pinned yet</small>}</div></label>)}
      {homeAddress&&!addresses.some((a:any)=>a.address===homeAddress)&&<label className='radioRow'><input type='radio' checked={selected===homeAddress} onChange={selectHome}/><div><strong>Home</strong><small>{homeAddress}</small>{selected===homeAddress&&!Number.isFinite(homeLat)&&<small style={{color:'#e5484d',display:'block'}}>No exact location pinned yet</small>}</div></label>}

      {selected&&!selectedGeo&&<button className='purpleBtn small' style={{marginTop:8}} onClick={()=>setShowPicker(true)}><MapPin size={14}/> Pin exact location on map</button>}
      <button className='linkBtn' style={{marginTop:10}} onClick={()=>{setSelected('');setSelectedGeo(null);setShowPicker(true)}}><MapPin size={14}/> + Set a new delivery location on map</button>

      <h2 style={{marginTop:18}}>Delivery Time</h2>
      <label className='radioRow'><input type='radio' checked={scheduleMode==='ASAP'} onChange={()=>{setScheduleMode('ASAP');setScheduledFor('')}}/><div><strong>ASAP</strong><small>20-40 mins</small></div></label>
      <label className='radioRow'><input type='radio' checked={scheduleMode==='LATER'} onChange={()=>setScheduleMode('LATER')}/><div><strong>Schedule for later</strong><small>Choose a date and time</small></div></label>
      {scheduleMode==='LATER'&&<input className='plainInput' type='datetime-local' style={{marginTop:8}} min={minSchedule} max={maxSchedule} value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/>}
      <button className='purpleBtn wide' style={{marginTop:16}} onClick={continueStep1}>Continue</button>
    </>}
    {step===2&&<>
      <h2>Payment Method</h2>
      {walletBalance>0&&<label className='radioRow'><input type='checkbox' checked={useWallet} onChange={e=>setUseWallet(e.target.checked)}/><div><strong>Wallet Balance</strong><small>{money(walletBalance)} available</small></div></label>}
      <label className='radioRow'><input type='radio' checked={paymentMethod==='paystack'} onChange={()=>setPaymentMethod('paystack')}/><div><strong>Paystack</strong><small>Card, Bank Transfer, USSD</small></div></label>
      <label className='radioRow'><input type='radio' checked={paymentMethod==='cod'} onChange={()=>setPaymentMethod('cod')}/><div><strong>Cash on Delivery</strong><small>Pay your rider in cash when your order arrives</small></div></label>
      <h2 style={{marginTop:18}}>Promo Code</h2>
      <div className='addressBox'><div><input className='plainInput' style={{border:0,padding:0}} value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase())} placeholder='Enter code'/></div><button onClick={applyCoupon}>Apply</button></div>
      {couponError&&<small style={{color:'#e5484d'}}>{couponError}</small>}
      {couponInfo&&<small style={{color:'#2ecc71'}}>Promo applied: -{money(discount)}</small>}
      <button className='purpleBtn wide' style={{marginTop:16}} onClick={()=>setStep(3)}>Continue</button>
    </>}
    {step===3&&<>
      <h2>Review Order</h2>
      <div className='addressBox'><div><MapPin size={17}/><div><small>Deliver to</small><strong>{selected||homeAddress}</strong></div></div></div>
      {scheduledFor&&<div className='addressBox'><div><Package size={17}/><div><small>Scheduled for</small><strong>{new Date(scheduledFor).toLocaleString()}</strong></div></div></div>}
      {cart.map((p:any,i:number)=><div className='cartRow' key={i}><div className='tinyFood'>{p.emoji||'🍽️'}</div><div><strong>{p.name}</strong><small>{money(p.price)}</small></div></div>)}
      <div className='summary'>
        <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
        {discount>0&&<div><span>Promo discount</span><b>-{money(discount)}</b></div>}
        {walletApplied>0&&<div><span>Wallet credit</span><b>-{money(walletApplied)}</b></div>}
        <div><span>Delivery &amp; service fees</span><b>Calculated at order</b></div>
        <div className='total'><span>{paymentMethod==='cod'?'Pay rider on delivery':'Total'}</span><b>{money(estTotal)}+ fees</b></div>
      </div>
      <button className='purpleBtn wide' onClick={()=>{goReview();checkout()}}>{paymentMethod==='cod'?'Place Order (Cash on Delivery)':'Place Order'}</button>
    </>}
  </main></div>;
}
function OrderConfirmedScreen({order,onTrack,onHome}:any){const km=Number(order?.deliveryDistanceKm||0);const est=km<=2?'15-25 mins':km<=6?'25-40 mins':'40-60 mins';return <div className='phoneApp'><main className='detailBody' style={{textAlign:'center',paddingTop:60}}><div className='confirmCheck'><Check size={40}/></div><h1>Order Confirmed!</h1><p>Your order has been received</p>{order?.paymentMethod==='cod'&&<p style={{color:'#c792ea'}}>Have {money(order.total)} ready to pay your rider in cash on delivery.</p>}<div className='summary' style={{textAlign:'left',marginTop:24}}><div><span>Order ID</span><b>#{order?.id}</b></div><div><span>Estimated time</span><b>{est}</b></div></div><button className='purpleBtn wide' style={{marginTop:24}} onClick={onTrack}>Track Order</button><button className='outlineBtn wide' style={{marginTop:10}} onClick={onHome}>Back to Home</button></main></div>}
function VendorDetail({vendor,products,back,add,cartCount,favorited,onFavorite}:any){const ps=products.filter((p:any)=>p.vendorUserId===vendor.userId||p.vendor===vendor.businessName||p.vendor===vendor.name);const cats=Array.from(new Set(ps.map((p:any)=>p.category).filter(Boolean)));const [tab,setTab]=useState('Popular');const shown=tab==='Popular'?ps:ps.filter((p:any)=>p.category===tab);return <div className='phoneApp'><TopBar title='' onBack={back} cartCount={cartCount}/><main className='detailBody'><div className='vendorHero'><div className='vendorCover'>🍛</div><div className='vendorInfo'><div className='vendorLogo large'>{String(vendor.businessName||vendor.name||'V').slice(0,2).toUpperCase()}</div><div><h1>{vendor.businessName||vendor.name}</h1><p><Star size={12} fill='currentColor'/> {vendor.rating||'New'}{vendor.reviewCount?` (${vendor.reviewCount})`:''} · {vendor.eta||'Available'}</p><small>{vendor.address||'Delivery available'}</small></div>{onFavorite&&<button className='circleBtn' onClick={onFavorite} aria-label='Favorite' style={{marginLeft:'auto'}}><Heart size={16} fill={favorited?'currentColor':'none'}/></button>}</div></div><div className='detailTabs'>{['Popular',...cats].map((t:any)=><span key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</span>)}</div>{!shown.length&&<div className='emptyState'>No items in this category yet.</div>}{shown.map((p:any)=><div className='menuRow' key={p.id} onClick={()=>add(p)}><div className='tinyFood'>{p.imageUrls?.[0]?<img src={p.imageUrls[0]} alt='' style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}}/>:(p.emoji||'🍽️')}</div><div><strong>{p.name}</strong><small>{money(p.price)}</small></div><button className='plusBtn'><Plus size={16}/></button></div>)}</main></div>}
function ProductDetail({product,back,add,cartCount,favorited,onFavorite}:any){return <div className='phoneApp'><TopBar title='' onBack={back} cartCount={cartCount}/><main className='detailBody productDetail'><div className='bigFood'>{product.imageUrls?.[0]?<img src={product.imageUrls[0]} alt={product.name} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:20}}/>:(product.emoji||'🍽️')}</div><div className='detailVendor'><span>{product.vendor}</span><span><Star size={12} fill='currentColor'/> {product.rating||4.8}</span>{onFavorite&&<button className='circleBtn' onClick={onFavorite} aria-label='Favorite'><Heart size={16} fill={favorited?'currentColor':'none'}/></button>}</div><h1>{product.name}</h1><p>Deliciously prepared and delivered fresh to your doorstep.</p><div className='addon'><strong>Add-ons</strong><label><input type='checkbox'/> Extra Chicken <b>₦800</b></label><label><input type='checkbox'/> Fried Plantain <b>₦400</b></label><label><input type='checkbox'/> Coleslaw <b>₦300</b></label></div><button className='purpleBtn wide bottomAction' onClick={add}>Add to Cart · {money(product.price)}</button></main></div>}
function CartScreen({cart,setCart,back,checkout,couponCode,setCouponCode,couponInfo,couponError,applyCoupon}:any){const grouped:any[]=[];cart.forEach((p:any)=>{const g=grouped.find(x=>x.id===p.id);if(g)g.qty++;else grouped.push({...p,qty:1})});const subtotal=cart.reduce((s:number,p:any)=>s+p.price,0);const discount=couponInfo?.discount||0;const estTotal=Math.max(0,subtotal-discount);function incr(p:any){setCart((c:any[])=>[...c,p])}function decr(id:string){setCart((c:any[])=>{const i=c.map((x:any)=>x.id).lastIndexOf(id);if(i<0)return c;return c.filter((_,x)=>x!==i)})}function clearCart(){if(window.confirm('Clear your entire cart?'))setCart([])}return <div className='phoneApp'><TopBar title='Cart' onBack={back}/><main className='detailBody'><div className='cartCount'>{cart.length} items{cart.length>0&&<button className='linkBtn' onClick={clearCart} style={{float:'right'}}>Clear</button>}</div>{!grouped.length&&<div className='emptyState'>Your cart is empty.</div>}{grouped.map((p:any)=><div className='cartRow' key={p.id}><div className='tinyFood'>{p.imageUrls?.[0]?<img src={p.imageUrls[0]} alt='' style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}}/>:(p.emoji||'🍽️')}</div><div><strong>{p.name}</strong><small>{p.vendor||''}</small></div><div className='qtyStepper'><button onClick={()=>decr(p.id)}>−</button><b>{p.qty}</b><button onClick={()=>incr(p)}>+</button></div></div>)}{grouped.length>0&&<><div className='addressBox'><div><input className='plainInput' style={{border:0,padding:0}} value={couponCode} onChange={e=>setCouponCode(e.target.value.toUpperCase())} placeholder='Enter code'/></div><button onClick={applyCoupon}>Apply</button></div>{couponError&&<small style={{color:'#e5484d'}}>{couponError}</small>}{couponInfo&&<small style={{color:'#2ecc71'}}>Promo applied: -{money(discount)}</small>}<div className='summary'><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{discount>0&&<div><span>Promo discount</span><b>-{money(discount)}</b></div>}<div><span>Delivery fee</span><b>Calculated at checkout</b></div><div className='total'><span>Estimated total</span><b>{money(estTotal)}</b></div></div><button className='purpleBtn wide' onClick={checkout}>Checkout <ArrowRight size={16}/></button></>}</main></div>}
function OrdersScreen({orders,back,myUserId}:any){const [localOrders,setLocalOrders]=useState(orders||[]);useEffect(()=>{setLocalOrders(orders||[])},[orders]);const [filterTab,setFilterTab]=useState('All');const [chatOrderId,setChatOrderId]=useState('');const ONGOING=['AWAITING_VENDOR','VENDOR_ACCEPTED','PREPARING','READY_FOR_PICKUP','ASSIGNED','PICKED_UP','ON_THE_WAY'];const demo=localOrders.filter((o:any)=>filterTab==='All'?true:filterTab==='Ongoing'?ONGOING.includes(String(o.deliveryStatus)):filterTab==='Completed'?o.deliveryStatus==='DELIVERED':o.deliveryStatus==='CANCELLED');const [tracking,setTracking]=useState<any>(null),[active,setActive]=useState<any>(null),[score,setScore]=useState(5),[comment,setComment]=useState('');async function refresh(){try{const r=await api.get('/api/orders');setLocalOrders(r.data.items||[])}catch{}}async function track(){const o=localOrders.find((x:any)=>x.deliveryStatus!=='DELIVERED'&&x.deliveryStatus!=='CANCELLED')||localOrders[0];if(!o){setTracking(null);return;}try{const r=await api.get('/api/rider/location/'+o.id);setTracking({...r.data,orderId:o.id})}catch{setTracking({assigned:false,orderId:o.id})}}useEffect(()=>{if(!tracking?.assigned||!tracking?.orderId)return;const timer=window.setInterval(track,10000);return()=>window.clearInterval(timer)},[tracking?.assigned,tracking?.orderId]);async function submit(){if(!active)return;try{await api.post('/api/ratings',{orderId:active.orderId,targetUserId:active.targetUserId,targetType:active.targetType,score,comment});setActive(null);setComment('')}catch(e:any){alert(e?.response?.data?.message||'Could not submit rating.')}}async function cancelOrder(id:string){if(!window.confirm('Cancel this order? This cannot be undone.'))return;try{await api.post('/api/orders/cancel',{orderId:id});await refresh()}catch(e:any){alert(e?.response?.data?.message||'This order can no longer be cancelled.')}}function canCancel(o:any){return !['DELIVERED','CANCELLED','REFUNDED'].includes(String(o.deliveryStatus||o.status))&&!o.riderId&&!['PREPARING','READY_FOR_PICKUP','ASSIGNED','PICKED_UP','ON_THE_WAY'].includes(String(o.deliveryStatus))}
if(chatOrderId)return <OrderChatScreen orderId={chatOrderId} myUserId={myUserId} back={()=>setChatOrderId('')}/>;
return <div className='phoneApp'><TopBar title='My Orders' onBack={back}/><main className='detailBody'><div className='orderTabs'>{['All','Ongoing','Completed','Cancelled'].map(t=><span key={t} className={filterTab===t?'on':''} onClick={()=>setFilterTab(t)}>{t}</span>)}</div>{!demo.length&&<div className='emptyState'>No orders here yet.</div>}{demo.map((o:any)=><div className='orderCard' key={o.id}><div className='orderIcon'><Package size={18}/></div><div><strong>Order #{o.id}</strong><small>{o.deliveryAddress||'Delivery address'} · {o.status}</small>{o.scheduledFor&&<small style={{display:'block',color:'#c792ea'}}>Scheduled: {new Date(o.scheduledFor).toLocaleString()}</small>}</div><div><b className={String(o.status).toLowerCase().replaceAll(' ','-')}>{money(o.total)}</b><small>{o.status}</small>{o.deliveryStatus==='DELIVERED'&&o.riderId&&<div style={{display:'flex',gap:4,marginTop:6}}><button className='miniPurple' onClick={()=>{setActive({orderId:o.id,targetUserId:o.vendorUserId,targetType:'vendor'});setScore(5)}}>Rate Vendor</button><button className='miniPurple' onClick={()=>{setActive({orderId:o.id,targetUserId:o.riderId,targetType:'rider'});setScore(5)}}>Rate Rider</button></div>}{canCancel(o)&&<button className='miniPurple' style={{marginTop:6}} onClick={()=>cancelOrder(o.id)}>Cancel Order</button>}{o.deliveryPin&&['ASSIGNED','PICKED_UP','ON_THE_WAY'].includes(o.deliveryStatus)&&<small style={{display:'block',marginTop:6,color:'#c792ea'}}>Delivery PIN: <b>{o.deliveryPin}</b> — give this to your rider on arrival</small>}</div></div>)}{active&&<div className='darkPanel' style={{marginTop:12}}><div className='panelTitle'><h2>Rate {active.targetType}</h2><button className='miniPurple' onClick={()=>setActive(null)}>Close</button></div><div style={{display:'flex',gap:8,margin:'12px 0'}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setScore(n)} aria-label={`${n} stars`} style={{background:'none',border:0,cursor:'pointer'}}><Star size={28} fill={n<=score?'currentColor':'none'}/></button>)}</div><textarea className='plainInput' value={comment} onChange={e=>setComment(e.target.value)} placeholder='Tell us about your experience (optional)' rows={3}/><button className='purpleBtn wide' onClick={submit}>Submit Rating</button></div>}{localOrders.length>0&&<button className='trackingCard' onClick={track}><MapPin size={19}/><div><strong>Track your order</strong><small>{tracking?.assigned?(tracking.online?'Rider online · location updated':'Rider assigned · waiting for location'):'Open live rider tracking'}</small></div><ChevronRight size={18}/></button>}{tracking&&<div className='darkPanel'><div className='panelTitle'><h2>Track Order</h2><span>#{tracking.orderId}</span></div>{tracking.lat?<><div style={{height:220,borderRadius:16,overflow:'hidden',marginTop:10}}><iframe title='Live rider map' style={{width:'100%',height:'100%',border:0}} src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(tracking.lng)-0.01},${Number(tracking.lat)-0.01},${Number(tracking.lng)+0.01},${Number(tracking.lat)+0.01}&layer=mapnik&marker=${Number(tracking.lat)},${Number(tracking.lng)}`}/></div><div className='riderRow'><div className='profileAvatar small'>{String(tracking.riderName||'R').slice(0,1).toUpperCase()}</div><div><strong>{tracking.riderName}</strong><small><Star size={11} fill='currentColor'/> {tracking.riderRating||'New'} · Rider</small></div>{tracking.riderPhone&&<a className='circleBtn' href={`tel:${tracking.riderPhone}`}><Phone size={16}/></a>}<button className='circleBtn' onClick={()=>setChatOrderId(tracking.orderId)}><MessageCircle size={16}/></button></div><small>{tracking.online?'Rider is online':'Rider is currently offline'}</small></>:<small>Rider location is not available yet.</small>}</div>}</main></div>}
function OrderChatScreen({orderId,myUserId,back}:any){const [messages,setMessages]=useState<any[]>([]);const [text,setText]=useState('');const [sending,setSending]=useState(false);const load=async()=>{try{const r=await api.get(`/api/orders/${orderId}/messages`);setMessages(r.data.items||[])}catch{}};useEffect(()=>{load();const t=window.setInterval(load,6000);return()=>window.clearInterval(t)},[orderId]);async function send(){const value=text.trim();if(!value||sending)return;setSending(true);try{const r=await api.post(`/api/orders/${orderId}/messages`,{text:value});setMessages(m=>[...m,r.data]);setText('')}catch(e:any){alert(e?.response?.data?.message||'Could not send message.')}finally{setSending(false)}}return <div className='phoneApp'><TopBar title='Order Chat' onBack={back}/><main className='chatBody'><div className='chatIntro'><strong>Order #{orderId}</strong><small>Messages are only visible to you and the other party on this delivery</small></div>{!messages.length&&<div className='bubble incoming'>Say hello — coordinate delivery details here.</div>}{messages.map((m:any)=><div className={'bubble '+(m.senderId===myUserId?'outgoing':'incoming')} key={m.id}>{m.text}</div>)}<div className='composer'><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder='Type a message...'/><button disabled={sending} onClick={send}><Send size={16}/></button></div></main></div>}
function NotificationsScreen({back}:any){const [items,setItems]=useState<any[]>([]);const load=async()=>{try{const r=await api.get('/api/notifications');setItems((r.data.items||[]).sort((a:any,b:any)=>Number(b.createdAt||0)-Number(a.createdAt||0)))}catch{}};useEffect(()=>{load()},[]);async function markRead(id:string){try{await api.post('/api/notifications/read',{id});await load()}catch{}}async function markAll(){try{await api.post('/api/notifications/read-all',{});await load()}catch{}}return <div className='phoneApp'><TopBar title='Notifications' onBack={back}/><main className='detailBody'>{items.length>0&&<button className='purpleBtn small' onClick={markAll}>Mark All as Read</button>}{!items.length&&<div className='emptyState'>You have no notifications yet.</div>}{items.map((n:any)=><button key={n.id} className='darkRow' style={{width:'100%',textAlign:'left',opacity:n.read?0.6:1}} onClick={()=>!n.read&&markRead(n.id)}><div><strong>{n.title||'Notification'}</strong><small>{n.body||''}</small></div>{!n.read&&<i className='navDot'>•</i>}</button>)}</main></div>}
function ChatScreen({back}:any){const [ticket,setTicket]=useState<any>(null),[text,setText]=useState(''),[sending,setSending]=useState(false),[uploading,setUploading]=useState(false),[rating,setRating]=useState(0),[ratingSaving,setRatingSaving]=useState(false);useEffect(()=>{api.get('/api/support/my-ticket').then(r=>setTicket(r.data.ticket)).catch(()=>{})},[]);async function send(){const value=text.trim();if(!value||sending)return;setSending(true);try{const r=await api.post('/api/support/messages',{text:value});setTicket(r.data.ticket);setText('')}catch{}finally{setSending(false)}}async function attach(file:File){if(!ticket?.id)return;setUploading(true);try{const {base64,contentType}=await readFileAsBase64(file);const r=await api.post('/api/support/attachment',{ticketId:ticket.id,name:file.name,content:base64,contentType});setTicket(r.data.ticket)}catch{}finally{setUploading(false)}}async function rate(score:number){setRatingSaving(true);try{const r=await api.post('/api/support/satisfaction',{score});setTicket(r.data.ticket);setRating(score)}catch(e:any){alert(e?.response?.data?.message||'Could not save rating.')}finally{setRatingSaving(false)}}const replies=ticket?.replies||[];const attachments=ticket?.attachments||[];return <div className='phoneApp'><TopBar title='Support' onBack={back}/><main className='chatBody'><div className='chatIntro'><div className='supportAvatar'>◉</div><strong>cönëct Support</strong><small>Usually replies quickly</small></div>{!replies.length&&<div className='bubble incoming'>Hi! How can we help you today?</div>}{replies.map((r:any,i:number)=><div className={'bubble '+(r.sender==='Customer'?'outgoing':'incoming')} key={i}>{r.text}</div>)}{attachments.map((a:any,i:number)=><div className='bubble outgoing' key={`att-${i}`}><a href={a.url} target='_blank' rel='noreferrer'>📎 {a.name}</a></div>)}{ticket?.status==='RESOLVED'&&<div className='darkPanel' style={{marginTop:10}}>{ticket.satisfactionScore?<small>Thanks for rating this conversation {ticket.satisfactionScore} ★</small>:<><small>How was your support experience?</small><div style={{display:'flex',gap:6,marginTop:8}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>rate(n)} disabled={ratingSaving} style={{background:'none',border:0,cursor:'pointer'}}><Star size={24} fill={n<=rating?'currentColor':'none'}/></button>)}</div></>}</div>}<div className='composer'><label className='circleBtn' style={{cursor:ticket?'pointer':'not-allowed'}}><Paperclip size={16}/><input type='file' accept='application/pdf,image/jpeg,image/png,image/webp' style={{display:'none'}} disabled={!ticket||uploading} onChange={e=>{const f=e.target.files?.[0];if(f)attach(f);e.target.value=''}}/></label><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder={ticket?'Type a message...':'Send a message to start a ticket'}/><button disabled={sending} onClick={send}><Send size={16}/></button></div></main></div>}
function ProfileScreen({profile,signOut,back,savedCount,onNav}:any){return <div className='phoneApp'><TopBar title='Profile' onBack={back}/><main className='detailBody'><div className='profileHero'><div className='profileAvatar'>{(profile?.name||'C').slice(0,1).toUpperCase()}</div><div><h2>{profile?.name||'Customer'}</h2><p>{profile?.phone||'Phone number'}</p></div></div><section className='darkPanel' style={{padding:'6px 8px'}}><button className='menuRow2' onClick={()=>onNav('orders')}><User size={17}/><span>My Orders</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>onNav('addresses')}><MapPin size={17}/><span>Addresses</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>onNav('payments')}><Wallet size={17}/><span>Payment Methods</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>onNav('wallet')}><Wallet size={17}/><span>Wallet</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>onNav('favorites')}><Heart size={17}/><span>Favorites{savedCount?` (${savedCount})`:''}</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>onNav('help')}><MessageCircle size={17}/><span>Help &amp; Support</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>onNav('settings')}><Settings size={17}/><span>Settings</span><ChevronRight size={16}/></button></section>{(!profile?.role||profile?.role==='customer')&&<button className='menuRow2' onClick={()=>onNav('grow')}><Store size={17}/><span>Grow with cönëct</span><ChevronRight size={16}/></button>}<button className='logoutBtn' onClick={signOut}>Log Out</button></main></div>}
function AddressesScreen({back,setNotice}:any){
  const [items,setItems]=useState<any[]>([]);
  const [form,setForm]=useState({label:'Home',address:''});
  const [formGeo,setFormGeo]=useState<{lat:number;lng:number}|null>(null);
  const [editing,setEditing]=useState('');
  const [showPicker,setShowPicker]=useState(false);
  const refresh=async()=>{try{const r=await api.get('/api/profile/settings');setItems(r.data.addresses||[])}catch{}};
  useEffect(()=>{refresh()},[]);

  async function save(){
    if(!form.address.trim())return setNotice('Enter an address.');
    if(!formGeo)return setNotice('Pin the exact location on the map before saving.');
    try{
      const payload={...form,lat:formGeo.lat,lng:formGeo.lng};
      if(editing){await api.put('/api/profile/address',{id:editing,...payload})}
      else{await api.post('/api/profile/address',payload)}
      setForm({label:'Home',address:''});
      setFormGeo(null);
      setEditing('');
      await refresh();
    }catch(e:any){setNotice(e?.response?.data?.message||'Could not save address.')}
  }
  async function setDefault(id:string){try{await api.post('/api/profile/address/default',{id});await refresh()}catch{}}
  async function remove(id:string){await api.delete('/api/profile/address',{id});await refresh()}
  function onPicked(loc:{lat:number;lng:number;address:string}){
    setShowPicker(false);
    setForm(f=>({...f,address:loc.address}));
    setFormGeo({lat:loc.lat,lng:loc.lng});
  }

  if(showPicker)return <LocationPicker api={api} initialLat={formGeo?.lat} initialLng={formGeo?.lng} onConfirm={onPicked} onCancel={()=>setShowPicker(false)}/>;

  return <div className='phoneApp'><TopBar title='Addresses' onBack={back}/><main className='detailBody'>
    {items.map((a:any)=><div className='darkRow' key={a.id}>
      <div><strong>{a.label}{a.isDefault?<i className='defaultTag'>Default</i>:null}</strong><small>{a.address}</small>{!Number.isFinite(a.lat)&&<small style={{color:'#e5484d',display:'block'}}>No exact location pinned</small>}</div>
      <div style={{display:'flex',gap:4}}>
        {!a.isDefault&&<button className='miniPurple' onClick={()=>setDefault(a.id)}>Set Default</button>}
        <button className='miniPurple' onClick={()=>{setEditing(a.id);setForm({label:a.label,address:a.address});setFormGeo(Number.isFinite(a.lat)&&Number.isFinite(a.lng)?{lat:a.lat,lng:a.lng}:null)}}>Edit</button>
        <button className='miniPurple' onClick={()=>remove(a.id)}>Delete</button>
      </div>
    </div>)}
    <section className='darkPanel'>
      <div className='panelTitle'><h2>{editing?'Edit Address':'Add New Address'}</h2></div>
      <div className='formStack'>
        <input className='plainInput' value={form.label} onChange={e=>setForm({...form,label:e.target.value})} placeholder='Label (e.g. Home, Office)'/>
        <button type='button' className='purpleBtn small' onClick={()=>setShowPicker(true)}><MapPin size={14}/> {formGeo?'Location pinned - tap to adjust':'Set location on map'}</button>
        {form.address&&<small>{form.address}</small>}
        <button className='purpleBtn' onClick={save}>{editing?'Save Changes':'Add Address'}</button>
        {editing&&<button className='miniPurple' onClick={()=>{setEditing('');setForm({label:'Home',address:''});setFormGeo(null)}}>Cancel</button>}
      </div>
    </section>
  </main></div>;
}
function PaymentMethodsScreen({back,setNotice}:any){const [items,setItems]=useState<any[]>([]);const [pm,setPm]=useState({label:'Card',last4:'',brand:'Card'});const refresh=async()=>{try{const r=await api.get('/api/profile/settings');setItems(r.data.paymentMethods||[])}catch{}};useEffect(()=>{refresh()},[]);async function add(){if(pm.last4.replace(/\D/g,'').length!==4)return setNotice('Enter the last 4 digits of the card.');await api.post('/api/profile/payment-method',pm);setPm({label:'Card',last4:'',brand:'Card'});await refresh()}return <div className='phoneApp'><TopBar title='Payment Methods' onBack={back}/><main className='detailBody'><small>Paystack handles your card securely at checkout. Save a label below for your own reference.</small>{items.map((m:any)=><div className='darkRow' key={m.id}><div><strong>{m.brand}</strong><small>•••• {m.last4}</small></div></div>)}<section className='darkPanel' style={{marginTop:12}}><div className='panelTitle'><h2>Add Card Reference</h2></div><div className='formStack'><input className='plainInput' value={pm.brand} onChange={e=>setPm({...pm,brand:e.target.value})} placeholder='Card brand (e.g. Verve, Mastercard)'/><input className='plainInput' value={pm.last4} onChange={e=>setPm({...pm,last4:e.target.value})} placeholder='Last 4 digits' maxLength={4}/><button className='purpleBtn' onClick={add}>Save Card</button></div></section></main></div>}
function CustomerWalletScreen({back,orders}:any){const [balance,setBalance]=useState(0);useEffect(()=>{api.get('/api/wallet').then(r=>setBalance(Number(r.data?.balance||0))).catch(()=>{})},[]);const spent=(orders||[]).filter((o:any)=>Number(o.walletApplied||0)>0);return <div className='phoneApp'><TopBar title='Wallet' onBack={back}/><main className='detailBody'><section className='darkPanel'><div className='panelTitle'><h2>Balance</h2></div><h1 style={{margin:0}}>{money(balance)}</h1><small>Gift credit awarded to your account. Usable at checkout.</small></section>{spent.length>0&&<section className='darkPanel' style={{marginTop:12}}><div className='panelTitle'><h2>Wallet Activity</h2></div>{spent.map((o:any)=><div className='darkRow' key={o.id}><div><strong>Order #{o.id}</strong><small>{new Date(o.createdAt).toLocaleDateString()}</small></div><b>-{money(o.walletApplied)}</b></div>)}</section>}</main></div>}
function HelpScreen({back,onContact}:any){const faqs=[['How do I track my order?','Open My Orders and tap on the active order to see live rider tracking once a rider is assigned.'],['How do I cancel an order?','You can cancel from My Orders as long as the vendor has not started preparing it yet.'],['How do refunds work?','Report an issue via Contact Us and our support team will review and process eligible refunds.'],['How do I pay?','You can pay with your cönëct Wallet balance and/or card, bank transfer, or USSD via Paystack.']];const [open,setOpen]=useState(-1);return <div className='phoneApp'><TopBar title='Help & Support' onBack={back}/><main className='detailBody'><section className='darkPanel'><div className='panelTitle'><h2>FAQs</h2></div>{faqs.map((f,i)=><div key={i} className='darkRow' style={{flexDirection:'column',alignItems:'flex-start',cursor:'pointer'}} onClick={()=>setOpen(open===i?-1:i)}><strong>{f[0]}</strong>{open===i&&<small style={{marginTop:6}}>{f[1]}</small>}</div>)}</section><button className='darkRow' style={{width:'100%',textAlign:'left'}} onClick={onContact}><div><strong>Contact Us</strong><small>Chat with our support team</small></div><ChevronRight size={16}/></button><button className='darkRow' style={{width:'100%',textAlign:'left'}} onClick={onContact}><div><strong>Report an Issue</strong><small>Let us know what went wrong</small></div><ChevronRight size={16}/></button></main></div>}
function ChangePasswordScreen({back,setNotice}:any){const [oldPassword,setOldPassword]=useState('');const [newPassword,setNewPassword]=useState('');const [confirm,setConfirm]=useState('');const [saving,setSaving]=useState(false);async function submit(){if(!oldPassword||!newPassword)return setNotice('Fill in your current and new password.');if(newPassword.length<8)return setNotice('New password must be at least 8 characters.');if(newPassword!==confirm)return setNotice('New passwords do not match.');setSaving(true);try{await api.post('/api/profile/change-password',{oldPassword,newPassword});setNotice('Password changed successfully.');setOldPassword('');setNewPassword('');setConfirm('')}catch(e:any){setNotice(e?.response?.data?.message||'Could not change password.')}finally{setSaving(false)}}return <div className='roleApp'><RoleHeader title='Change Password' role='' onBack={back}/><main className='roleBody'><div className='formStack'><input className='plainInput' type='password' value={oldPassword} onChange={e=>setOldPassword(e.target.value)} placeholder='Current password'/><input className='plainInput' type='password' value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder='New password'/><input className='plainInput' type='password' value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder='Confirm new password'/><button className='purpleBtn wide' onClick={submit} disabled={saving}>{saving?'Saving...':'Change Password'}</button></div></main></div>}
function SettingsScreen({back,theme,setTheme,signOut,setNotice}:any){const [showPw,setShowPw]=useState(false);if(showPw)return <ChangePasswordScreen back={()=>setShowPw(false)} setNotice={setNotice}/>;return <div className='phoneApp'><TopBar title='Settings' onBack={back}/><main className='detailBody'><section className='darkPanel'><div className='panelTitle'><h2>Appearance</h2></div><button className='themeRow' onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span><b>Theme</b><small>Use {theme==='dark'?'Light':'Dark'} mode</small></span><span className={'themeSwitch '+(theme==='light'?'on':'')}><i/></span></button></section><button className='menuRow2' onClick={()=>(window as any).conectOpenVerify?.()}><span>Verify Email &amp; Phone</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setShowPw(true)}><span>Change Password</span><ChevronRight size={16}/></button><section className='darkPanel' style={{marginTop:12}}><div className='panelTitle'><h2>About</h2></div><div className='darkRow'><div><strong>cönëct</strong><small>Order · Track · Receive</small></div></div></section><button className='logoutBtn' onClick={signOut}>Log Out</button></main></div>}
function GrowScreen({back,becomeRole}:any){return <div className='phoneApp'><TopBar title='Grow with cönëct' onBack={back}/><main className='detailBody'><section className='darkPanel'><div className='darkRow'><div><strong>Become a Vendor</strong><small>Sell your products on cönëct.</small></div><button className='miniPurple' onClick={()=>{if(window.confirm('Apply to become a Vendor?'))becomeRole?.('vendor')}}>Apply</button></div><div className='darkRow'><div><strong>Become a Rider</strong><small>Earn money delivering orders.</small></div><button className='miniPurple' onClick={()=>{if(window.confirm('Apply to become a Rider?'))becomeRole?.('rider')}}>Apply</button></div></section></main></div>}
function RestaurantsScreen({vendors,back,onOpen,savedVendorEntryFor,toggleVendorFavorite}:any){const [q,setQ]=useState('');const filtered=(vendors||[]).filter((v:any)=>!q||String(v.businessName||v.name||'').toLowerCase().includes(q.toLowerCase()));return <div className='phoneApp'><TopBar title='Restaurants' onBack={back}/><main className='detailBody'><div className='searchInput'><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder='Search restaurants or cuisines'/></div>{!filtered.length&&<div className='emptyState'>No vendors match your search.</div>}{filtered.map((v:any)=><div className='vendorCard' key={v.userId||v.id} onClick={()=>onOpen(v)}><div className='vendorLogo'>{String(v.businessName||v.name||'V').slice(0,2).toUpperCase()}</div><div><strong>{v.businessName||v.name}</strong><span><Star size={12} fill='currentColor'/> {v.rating||'New'} · {v.eta||'Available'}</span><small>{v.address||'Delivery available'}</small></div><button className='circleBtn' onClick={e=>{e.stopPropagation();toggleVendorFavorite(v.userId)}}><Heart size={15} fill={savedVendorEntryFor(v.userId)?'currentColor':'none'}/></button><ChevronRight size={18}/></div>)}</main></div>}
function RoleHeader({title,role,onBack}:any){const [enabled,setEnabled]=useState(false);async function enable(){try{await notifications.subscribe();setEnabled(true)}catch(e:any){alert(e?.message||'Could not enable notifications.')}}return <header className='roleHeader'>{onBack?<button className='circleBtn' onClick={onBack}><ArrowLeft size={18}/></button>:<div className='miniBrand'><LogoMark/><b>cönëct</b></div>}<div><strong>{title}</strong><small>{role}</small></div><button className='circleBtn' onClick={enable} title='Enable notifications'><Bell size={18}/></button>{enabled&&<span className='cartBadge'>✓</span>}</header>}
function RoleNav({tab,setTab,items,icons}:any){return <nav className='roleNav'>{items.map((x:string,i:number)=>{const I=icons[i];return <button className={tab===x?'active':''} key={x} onClick={()=>setTab(x)}><I size={18}/><span>{x}</span></button>})}</nav>}
function Metric({label,value}:any){return <div className='metric'><small>{label}</small><strong>{value}</strong></div>}
function VendorApp({profile,tab,setTab,notice,setNotice,theme,setTheme,signOut}:any){const approved=profile?.status==='approved';const [items,setItems]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]);const [rating,setRating]=useState<any>({average:0,count:0});const [name,setName]=useState('');const [price,setPrice]=useState('');const [category,setCategory]=useState('Food');const [description,setDescription]=useState('');const [images,setImages]=useState<{base64:string;contentType:string;fileName:string;previewUrl:string}[]>([]);const [editingId,setEditingId]=useState('');const [editingAvailable,setEditingAvailable]=useState(true);const [saving,setSaving]=useState(false);const [showAddItem,setShowAddItem]=useState(false);const [menuFilter,setMenuFilter]=useState('All');const [orderFilter,setOrderFilter]=useState('New');const [sub,setSub]=useState('');const [selectedOrder,setSelectedOrder]=useState<any>(null);const [customers,setCustomers]=useState<any[]>([]);function resetForm(){setName('');setPrice('');setCategory('Food');setDescription('');setImages([]);setEditingId('');setEditingAvailable(true);setShowAddItem(false)}function startEdit(p:any){setEditingId(p.id);setName(p.name);setPrice(String(p.price));setCategory(p.category||'Food');setDescription(p.description||'');setEditingAvailable(p.available!==false);setImages([]);setShowAddItem(true)}async function addImage(file:File){if(images.length>=3)return setNotice('You can upload up to 3 photos per product.');if(file.size>1100000)return setNotice('Each photo must be under ~1.1MB.');try{const {base64,contentType}=await readFileAsBase64(file);if(!['image/jpeg','image/png','image/webp'].includes(contentType))return setNotice('Photos must be JPG, PNG or WebP.');setImages(imgs=>[...imgs,{base64,contentType,fileName:file.name,previewUrl:URL.createObjectURL(file)}])}catch{setNotice('Could not read that photo.')}}function removeImage(i:number){setImages(imgs=>imgs.filter((_,x)=>x!==i))}async function toggleAvailable(p:any){try{await api.put('/api/vendor/products',{id:p.id,name:p.name,price:p.price,category:p.category,available:!p.available});await load();setNotice(p.available?'Marked unavailable.':'Marked available.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not update product.')}}
const [business,setBusiness]=useState<any>(null);const [bizForm,setBizForm]=useState({businessName:'',category:'Restaurant',address:'',description:''});const [bizGeo,setBizGeo]=useState<{lat:number;lng:number}|null>(null);const [showBizPicker,setShowBizPicker]=useState(false);const [bizSaving,setBizSaving]=useState(false);const [vendorDocs,setVendorDocs]=useState<any[]>([]);const [uploadingDoc,setUploadingDoc]=useState('');const loadBiz=async()=>{try{const r=await api.get('/api/vendor/documents');setVendorDocs(r.data.items||[])}catch{}};useEffect(()=>{if(!approved)loadBiz()},[approved]);useEffect(()=>{api.get('/api/vendor/business').then(r=>{const b=r.data.business;if(b){setBusiness(b);setBizForm({businessName:b.businessName||'',category:b.category||'Restaurant',address:b.address||'',description:b.description||''});if(Number.isFinite(b.lat)&&Number.isFinite(b.lng))setBizGeo({lat:b.lat,lng:b.lng})}}).catch(()=>{})},[]);async function uploadDoc(documentType:string,file:File){setUploadingDoc(documentType);try{const {base64,contentType}=await readFileAsBase64(file);const r=await api.post('/api/vendor/documents',{documentType,base64,contentType,fileName:file.name});setVendorDocs(r.data.items||[]);setNotice('Document submitted for review.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not upload document.')}finally{setUploadingDoc('')}}function docStatus(documentType:string){const matches=vendorDocs.filter((d:any)=>d.documentType===documentType);return matches.length?matches[matches.length-1].status:undefined}
const load=async()=>{try{const [r,o]=await Promise.all([api.get('/api/vendor/products'),api.get('/api/vendor/orders')]);setItems(r.data.items||[]);setOrders(o.data.items||[])}catch{}};useEffect(()=>{load();api.get('/api/rating/visible/'+profile.userId).then(r=>setRating(r.data)).catch(()=>{})},[profile?.userId]);
async function submitProduct(){if(!name||!price)return setNotice('Enter product name and price.');setSaving(true);try{if(editingId){await api.put('/api/vendor/products',{id:editingId,name,price:Number(price),category,description,available:editingAvailable});setNotice('Product updated.')}else{await api.post('/api/vendor/products',{name,price:Number(price),category,description,images:images.map(({base64,contentType,fileName})=>({base64,contentType,fileName}))});setNotice('Product added.')}resetForm();await load()}catch(e:any){setNotice(e?.response?.data?.message||'Could not save product.')}finally{setSaving(false)}}
async function remove(id:string){await api.delete('/api/vendor/products',{id});if(editingId===id)resetForm();await load();setNotice('Product removed.')}
async function orderAction(id:string,status:string){try{await api.post('/api/vendor/orders/status',{orderId:id,status});await load();setSelectedOrder(null);setNotice('Order updated.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not update order.')}}
async function saveBusiness(){if(!bizForm.businessName.trim())return setNotice('Business name is required.');if(!bizGeo)return setNotice('Set your exact business location on the map first.');setBizSaving(true);try{const r=await api.post('/api/vendor/business',{businessName:bizForm.businessName.trim(),category:bizForm.category,address:bizForm.address.trim(),description:bizForm.description.trim(),phone:profile?.phone||'',lat:bizGeo.lat,lng:bizGeo.lng});setBusiness(r.data.business);setNotice('Business profile saved.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not save business profile.')}finally{setBizSaving(false)}}function onBizLocationPicked(loc:{lat:number;lng:number;address:string}){setShowBizPicker(false);setBizGeo({lat:loc.lat,lng:loc.lng});setBizForm(f=>({...f,address:loc.address}))}
if(showBizPicker)return <LocationPicker api={api} initialLat={bizGeo?.lat} initialLng={bizGeo?.lng} onConfirm={onBizLocationPicked} onCancel={()=>setShowBizPicker(false)}/>;
function BusinessForm({onSaved,submitLabel}:{onSaved?:()=>void;submitLabel?:string}){return <div className='formStack'><input className='plainInput' value={bizForm.businessName} onChange={e=>setBizForm({...bizForm,businessName:e.target.value})} placeholder='Business Name'/><select className='plainInput' value={bizForm.category} onChange={e=>setBizForm({...bizForm,category:e.target.value})}><option>Restaurant</option><option>Bakery</option><option>Grocery</option><option>Pharmacy</option><option>Other</option></select><button type='button' className='purpleBtn small' onClick={()=>setShowBizPicker(true)}><MapPin size={14}/> {bizGeo?'Location pinned - tap to adjust':'Set business location on map'}</button>{bizForm.address&&<small>{bizForm.address}</small>}<textarea className='plainInput' value={bizForm.description} onChange={e=>setBizForm({...bizForm,description:e.target.value})} placeholder='Short description' rows={3} maxLength={120}/><button className='purpleBtn wide' onClick={async()=>{await saveBusiness();onSaved?.()}} disabled={bizSaving}>{bizSaving?'Saving...':(submitLabel||'Save')}</button></div>}
if(sub==='business')return <div className='roleApp'><RoleHeader title='Business Settings' role='' onBack={()=>setSub('')}/><main className='roleBody'><BusinessForm/></main></div>;
const myOrders=orders.filter((o:any)=>o.vendorUserId===profile?.userId);const STAGE:Record<string,string[]>={New:['AWAITING_VENDOR'],Preparing:['VENDOR_ACCEPTED','PREPARING'],Ready:['READY_FOR_PICKUP'],Completed:['DELIVERED']};const filteredOrders=myOrders.filter((o:any)=>(STAGE[orderFilter]||[]).includes(o.deliveryStatus));const thisMonth=new Date().getMonth();const monthOrders=myOrders.filter((o:any)=>o.deliveryStatus==='DELIVERED'&&new Date(o.createdAt).getMonth()===thisMonth);const monthEarnings=monthOrders.reduce((s:number,o:any)=>s+Math.max(0,Number(o.subtotal||0)-Number(o.serviceFee||0)),0);const totalSales=myOrders.filter((o:any)=>o.deliveryStatus==='DELIVERED').reduce((s:number,o:any)=>s+Number(o.subtotal||0),0);const totalFees=myOrders.filter((o:any)=>o.deliveryStatus==='DELIVERED').reduce((s:number,o:any)=>s+Number(o.serviceFee||0),0);const feePct=totalSales>0?Math.round(totalFees/totalSales*100):3;
if(sub==='withdraw')return <WithdrawScreen profile={profile} back={()=>setSub('')} setNotice={setNotice}/>;
if(sub==='customers'){if(!customers.length)api.get('/api/vendor/customers').then(r=>setCustomers(r.data.items||[])).catch(()=>{});return <div className='roleApp'><RoleHeader title='Customers' role='' onBack={()=>setSub('')}/><main className='roleBody'>{!customers.length&&<div className='emptyState'>No customers yet.</div>}{customers.map((c:any)=><div className='darkRow' key={c.userId}><div><strong>{c.name}</strong><small>{c.orders} Orders{c.rating?` · ${c.rating} ★`:''}</small></div></div>)}</main></div>}
if(sub==='help')return <HelpScreen back={()=>setSub('')} onContact={()=>{setSub('');setTab('chat')}}/>;
if(sub==='chat')return <ChatScreen back={()=>setSub('')}/>;
if(sub==='notifications')return <NotificationsScreen back={()=>setSub('')}/>;
if(sub==='changePassword')return <ChangePasswordScreen back={()=>setSub('settings')} setNotice={setNotice}/>;
if(sub==='settings')return <div className='roleApp'><RoleHeader title='Settings' role='' onBack={()=>setSub('')}/><main className='roleBody'><button className='settingsRow' onClick={()=>setSub('business')}><span>Business Settings</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('withdraw')}><span>Bank Details</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('notifications')}><span>Notification Settings</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('help')}><span>Help &amp; Support</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>(window as any).conectOpenVerify?.()}><span>Verify Email &amp; Phone</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('changePassword')}><span>Change Password</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span>Appearance ({theme==='dark'?'Dark':'Light'})</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={signOut}><span>Logout</span><ChevronRight size={16}/></button></main></div>;
if(selectedOrder){const o=selectedOrder;return <div className='roleApp'><RoleHeader title='Order Details' role='' onBack={()=>setSelectedOrder(null)}/><main className='roleBody'><div className='darkPanel'><div className='panelTitle'><h2>#{o.id}</h2><span>{o.deliveryStatus}</span></div><small>Delivery Address</small><strong style={{display:'block',marginBottom:10}}>{o.deliveryAddress}</strong>{o.scheduledFor&&<><small>Scheduled For</small><strong style={{display:'block',marginBottom:10,color:'#c792ea'}}>{new Date(o.scheduledFor).toLocaleString()}</strong></>}{(o.items||[]).map((it:any,i:number)=><div className='darkRow' key={i}><div><strong>{it.name}</strong></div><b>{money(it.price)}</b></div>)}<div className='summary'><div><span>Subtotal</span><b>{money(o.subtotal)}</b></div><div><span>Delivery Fee</span><b>{money(o.deliveryFee)}</b></div><div className='total'><span>Total</span><b>{money(o.total)}</b></div></div></div>{o.deliveryStatus==='AWAITING_VENDOR'&&<div style={{display:'flex',gap:8,marginTop:12}}><button className='purpleBtn wide' onClick={()=>orderAction(o.id,'ACCEPTED')}>Accept Order</button><button className='outlineBtn wide' onClick={()=>orderAction(o.id,'REJECTED')}>Reject</button></div>}{o.deliveryStatus==='VENDOR_ACCEPTED'&&<button className='purpleBtn wide' style={{marginTop:12}} onClick={()=>orderAction(o.id,'PREPARING')}>Start Preparing</button>}{o.deliveryStatus==='PREPARING'&&<button className='purpleBtn wide' style={{marginTop:12}} onClick={()=>orderAction(o.id,'READY_FOR_PICKUP')}>Mark Ready</button>}</main></div>}
if(!approved){const step=!business?1:2;return <div className='roleApp'><RoleHeader title='Vendor Onboarding' role='Vendor'/><main className='roleBody'>{vendorDocs.length>0||docStatus('governmentId')?<div className='verificationCard'><ShieldCheck size={26}/><h1>Verification Submitted</h1><p>Your verification is under review. We'll notify you once your account is verified and you can start selling.</p></div>:<><div className='stepper'><span className={step>=1?'on':''}>1<i/>Business Info</span><span className={step>=2?'on':''}>2<i/>Verification</span></div>{step===1&&<><h2>Complete Your Profile</h2><BusinessForm submitLabel='Continue'/></>}{step===2&&<><h2>Business Verification</h2><DocUploadRow label='CAC Certificate (Optional)' status={docStatus('businessRegistration')} uploading={uploadingDoc==='businessRegistration'} onFile={f=>uploadDoc('businessRegistration',f)}/><DocUploadRow label='Business Logo' status={docStatus('businessLogo')} uploading={uploadingDoc==='businessLogo'} onFile={f=>uploadDoc('businessLogo',f)}/><DocUploadRow label='Govt. ID / Means of ID' status={docStatus('governmentId')} uploading={uploadingDoc==='governmentId'} onFile={f=>uploadDoc('governmentId',f)}/><small style={{display:'block',marginTop:10}}>Submit your Government ID to complete verification.</small></>}</>}</main></div>}
return <div className='roleApp'><RoleHeader title={tab==='dashboard'?'Dashboard':tab==='orders'?'Orders':tab==='menu'?'Menu':tab==='wallet'?'Wallet':'Profile'} role='Vendor'/><main className='roleBody'>
{tab==='dashboard'&&<><div className='darkPanel'><div className='panelTitle'><h2>Total Earnings (This Month)</h2></div><h1 style={{margin:'8px 0 0'}}>{money(monthEarnings)}</h1></div><div className='metricGrid'><Metric label='Orders' value={String(myOrders.length)}/><Metric label='Pending' value={String(myOrders.filter((o:any)=>o.deliveryStatus==='AWAITING_VENDOR').length)}/><Metric label='Rating' value={rating.count?`${rating.average} ★`:'New'}/></div><div className='sectionHead'><h2>Recent Orders</h2><button onClick={()=>setTab('orders')}>See all</button></div>{myOrders.slice(0,4).map((o:any)=><div className='darkRow' key={o.id} onClick={()=>setSelectedOrder(o)} style={{cursor:'pointer'}}><div><strong>#{o.id}</strong><small>{money(o.total)} · {o.deliveryStatus}</small></div>{o.deliveryStatus==='AWAITING_VENDOR'&&<button className='miniPurple' onClick={e=>{e.stopPropagation();orderAction(o.id,'ACCEPTED')}}>Accept</button>}</div>)}</>}
{tab==='orders'&&<><div className='orderTabs'>{['New','Preparing','Ready','Completed'].map(t=><span key={t} className={orderFilter===t?'on':''} onClick={()=>setOrderFilter(t)}>{t}</span>)}</div>{!filteredOrders.length&&<div className='emptyState'>No orders here.</div>}{filteredOrders.map((o:any)=><div className='darkRow' key={o.id} onClick={()=>setSelectedOrder(o)} style={{cursor:'pointer'}}><div><strong>#{o.id}</strong><small>{(o.items||[]).length} items · {money(o.total)}</small></div>{o.deliveryStatus==='AWAITING_VENDOR'&&<button className='miniPurple' onClick={e=>{e.stopPropagation();orderAction(o.id,'ACCEPTED')}}>Accept</button>}</div>)}</>}
{tab==='menu'&&<>{!showAddItem?<button className='purpleBtn wide' onClick={()=>setShowAddItem(true)}>+ Add New Item</button>:<div className='darkPanel'><div className='panelTitle'><h2>{editingId?'Edit Item':'Add New Item'}</h2></div><div className='formStack'><input className='plainInput' value={name} onChange={e=>setName(e.target.value)} placeholder='Item name'/><select className='plainInput' value={category} onChange={e=>setCategory(e.target.value)}><option>Food</option><option>Pastries</option><option>Drinks</option><option>Groceries</option></select><input className='plainInput' value={price} onChange={e=>setPrice(e.target.value)} placeholder='Price in ₦' inputMode='numeric'/><textarea className='plainInput' value={description} onChange={e=>setDescription(e.target.value)} placeholder='Description (optional)' rows={2}/>{!editingId&&<div className='addressBox' style={{flexWrap:'wrap',gap:8}}>{images.map((img,i)=><div key={i} style={{position:'relative'}}><img src={img.previewUrl} alt='' style={{width:48,height:48,borderRadius:8,objectFit:'cover'}}/><button onClick={()=>removeImage(i)} className='deleteBtn' style={{position:'absolute',top:-6,right:-6}}><X size={12}/></button></div>)}{images.length<3&&<label className='miniPurple' style={{cursor:'pointer'}}>+ Photo<input type='file' accept='image/jpeg,image/png,image/webp' style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)addImage(f);e.target.value=''}}/></label>}</div>}<div style={{display:'flex',gap:8}}><button className='purpleBtn' onClick={submitProduct} disabled={saving}>{saving?'Saving...':editingId?'Save Item':'Save Item'}</button><button className='miniPurple' onClick={resetForm}>Cancel</button></div></div></div>}<div className='orderTabs'>{['All','Available','Unavailable'].map(t=><span key={t} className={menuFilter===t?'on':''} onClick={()=>setMenuFilter(t)}>{t}</span>)}</div>{items.filter((p:any)=>menuFilter==='All'?true:menuFilter==='Available'?p.available!==false:p.available===false).map(p=><div className='darkRow' key={p.id}><div className='menuTiny'>{p.imageUrls?.[0]?<img src={p.imageUrls[0]} alt='' style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}}/>:'🍽️'}</div><div><strong onClick={()=>startEdit(p)} style={{cursor:'pointer'}}>{p.name}</strong><small>{money(p.price)}</small></div><span className={'themeSwitch '+(p.available!==false?'on':'')} onClick={()=>toggleAvailable(p)} style={{cursor:'pointer'}}><i/></span></div>)}</>}
{tab==='wallet'&&<><div className='darkPanel'><div className='panelTitle'><h2>Available Balance</h2></div><h1 style={{margin:'8px 0 0'}}>{money(totalSales-totalFees)}</h1><div style={{display:'flex',gap:8,marginTop:12}}><button className='purpleBtn small' onClick={()=>setSub('withdraw')}>Withdraw</button><button className='miniPurple'>History</button></div></div><div className='panelTitle' style={{marginTop:16}}><h2>Wallet Summary</h2></div><div className='darkRow'><div><strong>Total Earnings</strong></div><b>{money(totalSales-totalFees)}</b></div><div className='darkRow'><div><strong>Total Sales</strong></div><b>{money(totalSales)}</b></div><div className='darkRow'><div><strong>Platform Fee ({feePct}%)</strong></div><b>-{money(totalFees)}</b></div></>}
{tab==='profile'&&<><div className='profileHero'><div className='profileAvatar'>{(profile?.name||'V').slice(0,1).toUpperCase()}</div><div><h2>{profile?.name}</h2><p>Verified Vendor</p></div></div><section className='darkPanel' style={{padding:'6px 8px'}}><button className='menuRow2' onClick={()=>setTab('dashboard')}><Home size={17}/><span>Dashboard</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('customers')}><User size={17}/><span>Customers</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('withdraw')}><Wallet size={17}/><span>Bank Details</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('notifications')}><Bell size={17}/><span>Notifications</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('help')}><MessageCircle size={17}/><span>Help &amp; Support</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('settings')}><Settings size={17}/><span>Settings</span><ChevronRight size={16}/></button></section></>}
</main><RoleNav tab={tab} setTab={setTab} items={['dashboard','orders','menu','wallet','profile']} icons={[Home,Package,Store,Wallet,User]}/>{notice&&<Toast text={notice} close={()=>setNotice('')}/>}</div>}
function WithdrawScreen({profile,back,setNotice}:any){const [balance,setBalance]=useState(0);const [banks,setBanks]=useState<{name:string;code:string}[]>([]);const [bank,setBank]=useState({bankCode:profile?.bankCode||'',bankName:profile?.bankName||'',accountNumber:profile?.accountNumber||'',accountName:profile?.accountName||''});const [amount,setAmount]=useState('');const [saving,setSaving]=useState(false);const [requesting,setRequesting]=useState(false);const hasBank=Boolean(profile?.bankName&&profile?.accountNumber);const load=async()=>{try{const w=await api.get('/api/wallet');setBalance(Number(w.data?.balance||0))}catch{}};useEffect(()=>{load();if(!hasBank)api.get('/api/payouts/banks').then(r=>setBanks(r.data.items||[])).catch(()=>{})},[]);async function saveBank(){if(!bank.bankCode||!bank.accountNumber.trim()||!bank.accountName.trim())return setNotice('Select your bank and enter your account details.');setSaving(true);try{await api.post('/api/payouts/bank-details',bank);setNotice('Bank details saved and verified.');window.location.reload()}catch(e:any){setNotice(e?.response?.data?.message||'Could not save bank details.')}finally{setSaving(false)}}async function withdraw(){const amt=Number(amount);if(!(amt>0))return setNotice('Enter a valid amount.');if(amt>balance)return setNotice('Amount exceeds your available balance.');setRequesting(true);try{await api.post('/api/payouts/request',{amount:amt});setNotice('Withdrawal initiated — funds are on their way to your bank.');setAmount('');await load()}catch(e:any){setNotice(e?.response?.data?.message||'Could not process withdrawal.')}finally{setRequesting(false)}}return <div className='roleApp'><RoleHeader title='Withdraw' role='' onBack={back}/><main className='roleBody'><div className='darkPanel'><div className='panelTitle'><h2>Available Balance</h2></div><h1 style={{margin:'8px 0 0'}}>{money(balance)}</h1></div>{!hasBank?<div className='darkPanel'><div className='panelTitle'><h2>Add Bank Account</h2></div><div className='formStack'><select className='plainInput' value={bank.bankCode} onChange={e=>{const b=banks.find(x=>x.code===e.target.value);setBank({...bank,bankCode:e.target.value,bankName:b?.name||''})}}><option value=''>Select your bank</option>{banks.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}</select><input className='plainInput' value={bank.accountNumber} onChange={e=>setBank({...bank,accountNumber:e.target.value})} placeholder='Account number'/><input className='plainInput' value={bank.accountName} onChange={e=>setBank({...bank,accountName:e.target.value})} placeholder='Account name'/><button className='purpleBtn' onClick={saveBank} disabled={saving}>{saving?'Verifying...':'Save Bank Account'}</button></div></div>:<><div className='formStack' style={{marginTop:14}}><input className='plainInput' type='number' value={amount} onChange={e=>setAmount(e.target.value)} placeholder='Enter amount'/><div style={{display:'flex',gap:8}}>{[5000,10000,20000].map(v=><button key={v} className='miniPurple' onClick={()=>setAmount(String(v))}>{money(v)}</button>)}<button className='miniPurple' onClick={()=>setAmount(String(balance))}>All</button></div></div><div className='darkPanel' style={{marginTop:14}}><div className='panelTitle'><h2>Withdrawal Method</h2></div><div className='darkRow'><div><strong>Bank Account</strong><small>{profile.bankName} · {profile.accountNumber} · {profile.accountName}</small></div></div></div><small style={{display:'block',marginTop:10}}>Withdrawals are sent directly to your bank account via Paystack Transfers.</small><button className='purpleBtn wide' style={{marginTop:16}} onClick={withdraw} disabled={requesting}>{requesting?'Processing...':'Withdraw Now'}</button></>}</main></div>}
function OrderActionCard({order,profile,online,onClaim,onAdvance,onMessage}:any){const mine=order.riderId===profile?.userId;const stage=order.deliveryStatus;const title=!mine?'New Order':stage==='ASSIGNED'?'Order In Progress':stage==='PICKED_UP'||stage==='ON_THE_WAY'?'Delivering Order':'Order';const nextLabel=stage==='ASSIGNED'?'Order Picked Up':stage==='PICKED_UP'?'Arrived at Drop-off':stage==='ON_THE_WAY'?'Order Delivered':'Update';return <div className='darkPanel'><div className='panelTitle'><h2>{title}</h2><span>#{order.id}</span></div>{order.paymentMethod==='cod'&&<small style={{color:'#c792ea',display:'block',marginBottom:8}}>💵 Collect {money(order.total)} cash on delivery</small>}<div className='addressBox'><div><MapPin size={16}/><div><small>Pickup</small><strong>Vendor location</strong></div></div></div><div className='addressBox'><div><MapPin size={16}/><div><small>Drop-off</small><strong>{order.deliveryAddress}</strong></div></div>{mine&&<button className='circleBtn' onClick={()=>onMessage(order.id)}><MessageCircle size={16}/></button>}{mine&&order.customerPhone&&<a className='circleBtn' href={`tel:${order.customerPhone}`}><Phone size={16}/></a>}</div><div className='summary'><div><span>Earnings</span><b>{money(order.deliveryFee||0)}</b></div><div><span>Distance</span><b>{order.deliveryDistanceKm?`${order.deliveryDistanceKm} km`:'—'}</b></div></div>{!mine?<div style={{display:'flex',gap:8}}><button className='purpleBtn wide' onClick={()=>onClaim(order.id)} disabled={!online}>Accept</button></div>:<button className='purpleBtn wide' onClick={()=>onAdvance(order)}>{nextLabel}</button>}</div>}
function RiderApp({profile,tab,setTab,notice,setNotice,theme,setTheme,signOut}:any){const approved=profile?.status==='approved';const [online,setOnline]=useState(Boolean(profile?.online));const [rating,setRating]=useState<any>({average:0,count:0});const [orders,setOrders]=useState<any[]>([]),[earnings,setEarnings]=useState<any>({earnings:0,completedDeliveries:0,history:[]});const [geo,setGeo]=useState<any>(null);const [sub,setSub]=useState('');const [chatOrderId,setChatOrderId]=useState('');const [orderTab,setOrderTab]=useState('All');const [vehicleForm,setVehicleForm]=useState({vehicleType:profile?.vehicleType||'Motorcycle',plateNumber:profile?.plateNumber||'',vehicleModel:profile?.vehicleModel||''});const [vehicleSaving,setVehicleSaving]=useState(false);const [vehicleSaved,setVehicleSaved]=useState(Boolean(profile?.plateNumber));const [riderDocs,setRiderDocs]=useState<any[]>([]);const [uploadingDoc,setUploadingDoc]=useState('');const loadDocs=async()=>{try{const r=await api.get('/api/rider/documents');setRiderDocs(r.data.items||[])}catch{}};useEffect(()=>{loadDocs()},[]);async function saveVehicle(){if(!vehicleForm.plateNumber.trim())return setNotice('Enter your vehicle plate number.');setVehicleSaving(true);try{await api.post('/api/rider/vehicle',vehicleForm);setVehicleSaved(true);setNotice('Vehicle information saved.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not save vehicle information.')}finally{setVehicleSaving(false)}}async function uploadDoc(documentType:string,file:File){setUploadingDoc(documentType);try{const {base64,contentType}=await readFileAsBase64(file);const r=await api.post('/api/rider/documents',{documentType,base64,contentType,fileName:file.name});setRiderDocs(r.data.items||[]);setNotice('Document submitted for review.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not upload document.')}finally{setUploadingDoc('')}}function docStatus(documentType:string){const matches=riderDocs.filter((d:any)=>d.documentType===documentType);return matches.length?matches[matches.length-1].status:undefined}const load=async()=>{try{const [r,e]=await Promise.all([api.get('/api/orders'),api.get('/api/rider/earnings')]);setOrders(r.data.items||[]);setEarnings(e.data||{earnings:0,completedDeliveries:0,history:[]})}catch{}};useEffect(()=>{if(approved){load();api.get('/api/rating/visible/'+profile.userId).then(r=>setRating(r.data)).catch(()=>{})}},[approved,profile?.userId]);useEffect(()=>{if(!online||!approved||!navigator.geolocation)return;let last=0;const watchId=navigator.geolocation.watchPosition(p=>{const now=Date.now();setGeo({lat:p.coords.latitude,lng:p.coords.longitude});if(now-last<8000)return;last=now;api.post('/api/rider/status',{online:true,lat:p.coords.latitude,lng:p.coords.longitude}).catch(()=>{})},()=>{},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});return()=>navigator.geolocation.clearWatch(watchId)},[online,approved]);useEffect(()=>{if(!online||!approved)return;const poll=window.setInterval(load,15000);return()=>window.clearInterval(poll)},[online,approved]);async function toggle(){let g=geo;if(!g&&navigator.geolocation)await new Promise<void>(resolve=>navigator.geolocation.getCurrentPosition(p=>{g={lat:p.coords.latitude,lng:p.coords.longitude};setGeo(g);resolve()},()=>resolve()));try{const r=await api.post('/api/rider/status',{online:!online,lat:g?.lat,lng:g?.lng});setOnline(r.data.online);setNotice(r.data.online?'You are now online.':'You are now offline.');await load()}catch(e:any){setNotice(e?.response?.data?.message||'Could not update rider status.')}}async function claim(id:string){try{await api.post('/api/delivery/claim',{orderId:id});await load();setNotice('Delivery accepted.')}catch(e:any){setNotice(e?.response?.data?.message||'Delivery unavailable.')}}async function advance(o:any){const next=o.deliveryStatus==='ASSIGNED'?'PICKED_UP':o.deliveryStatus==='PICKED_UP'?'ON_THE_WAY':'DELIVERED';let deliveryPin:string|undefined;if(next==='DELIVERED'){const entered=window.prompt('Enter the 4-digit delivery PIN from the customer:');if(!entered)return;deliveryPin=entered.trim()}try{await api.post('/api/delivery/status',{orderId:o.id,status:next,deliveryPin});await load();setNotice(next==='DELIVERED'?'Delivery complete! Earnings added to your wallet.':`Order marked ${next.replace('_',' ').toLowerCase()}.`)}catch(e:any){setNotice(e?.response?.data?.message||'Could not update delivery.')}}
const myActive=orders.find((o:any)=>o.riderId===profile?.userId&&o.deliveryStatus!=='DELIVERED'&&o.deliveryStatus!=='CANCELLED');const available=orders.filter((o:any)=>!o.riderId);
const today=new Date().toDateString();const todaysDeliveries=(earnings.history||[]).filter((o:any)=>new Date(o.deliveredAt).toDateString()===today);const todaysEarnings=todaysDeliveries.reduce((s:number,o:any)=>s+Number(o.deliveryFee||0),0);
if(chatOrderId)return <OrderChatScreen orderId={chatOrderId} myUserId={profile?.userId} back={()=>setChatOrderId('')}/>;
if(!approved)return <div className='roleApp'><RoleHeader title='Rider Dashboard' role='Rider'/><main className='roleBody'><div className='verificationCard'><ShieldCheck size={26}/><h1>Complete rider verification</h1><p>Submit your vehicle information and documents below. Delivery assignments unlock once Admin approves your account.</p><div className='panelTitle' style={{marginTop:10}}><h2>Vehicle Information</h2></div><div className='formStack'><select className='plainInput' value={vehicleForm.vehicleType} onChange={e=>setVehicleForm({...vehicleForm,vehicleType:e.target.value})}><option>Motorcycle</option><option>Bicycle</option><option>Car</option><option>Tricycle</option></select><input className='plainInput' value={vehicleForm.plateNumber} onChange={e=>setVehicleForm({...vehicleForm,plateNumber:e.target.value.toUpperCase()})} placeholder='Plate number'/><input className='plainInput' value={vehicleForm.vehicleModel} onChange={e=>setVehicleForm({...vehicleForm,vehicleModel:e.target.value})} placeholder='Vehicle model (optional)'/><button className='purpleBtn' onClick={saveVehicle} disabled={vehicleSaving}>{vehicleSaving?'Saving...':vehicleSaved?'Update Vehicle Info':'Save Vehicle Info'}</button></div><div className='panelTitle' style={{marginTop:16}}><h2>Verification Documents</h2></div><DocUploadRow label="Government ID" status={docStatus('governmentId')} uploading={uploadingDoc==='governmentId'} onFile={f=>uploadDoc('governmentId',f)}/><DocUploadRow label="Rider's License" status={docStatus('ridersLicense')} uploading={uploadingDoc==='ridersLicense'} onFile={f=>uploadDoc('ridersLicense',f)}/><DocUploadRow label='Vehicle Registration' status={docStatus('vehicleRegistration')} uploading={uploadingDoc==='vehicleRegistration'} onFile={f=>uploadDoc('vehicleRegistration',f)}/></div></main></div>;
if(sub==='withdraw')return <WithdrawScreen profile={profile} back={()=>setSub('')} setNotice={setNotice}/>;
if(sub==='documents')return <div className='roleApp'><RoleHeader title='Documents' role='Rider' onBack={()=>setSub('')}/><main className='roleBody'><DocUploadRow label="Government ID" status={docStatus('governmentId')} uploading={uploadingDoc==='governmentId'} onFile={f=>uploadDoc('governmentId',f)}/><DocUploadRow label="Rider's License" status={docStatus('ridersLicense')} uploading={uploadingDoc==='ridersLicense'} onFile={f=>uploadDoc('ridersLicense',f)}/><DocUploadRow label='Vehicle Registration' status={docStatus('vehicleRegistration')} uploading={uploadingDoc==='vehicleRegistration'} onFile={f=>uploadDoc('vehicleRegistration',f)}/></main></div>;
if(sub==='vehicle')return <div className='roleApp'><RoleHeader title='Vehicle Information' role='Rider' onBack={()=>setSub('')}/><main className='roleBody'><div className='formStack'><select className='plainInput' value={vehicleForm.vehicleType} onChange={e=>setVehicleForm({...vehicleForm,vehicleType:e.target.value})}><option>Motorcycle</option><option>Bicycle</option><option>Car</option><option>Tricycle</option></select><input className='plainInput' value={vehicleForm.plateNumber} onChange={e=>setVehicleForm({...vehicleForm,plateNumber:e.target.value.toUpperCase()})} placeholder='Plate number'/><input className='plainInput' value={vehicleForm.vehicleModel} onChange={e=>setVehicleForm({...vehicleForm,vehicleModel:e.target.value})} placeholder='Vehicle model'/><button className='purpleBtn' onClick={saveVehicle} disabled={vehicleSaving}>{vehicleSaving?'Saving...':'Save Changes'}</button></div></main></div>;
if(sub==='notifications')return <NotificationsScreen back={()=>setSub('')}/>;
if(sub==='help')return <HelpScreen back={()=>setSub('')} onContact={()=>{setSub('');setTab('chat')}}/>;
if(sub==='chat')return <ChatScreen back={()=>setSub('')}/>;
if(sub==='changePassword')return <ChangePasswordScreen back={()=>setSub('settings')} setNotice={setNotice}/>;
if(sub==='settings')return <div className='roleApp'><RoleHeader title='Settings' role='' onBack={()=>setSub('')}/><main className='roleBody'><button className='settingsRow' onClick={()=>setSub('notifications')}><span>Notifications</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('help')}><span>Help &amp; Support</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>(window as any).conectOpenVerify?.()}><span>Verify Email &amp; Phone</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('changePassword')}><span>Change Password</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span>Appearance ({theme==='dark'?'Dark':'Light'})</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={signOut}><span>Logout</span><ChevronRight size={16}/></button></main></div>;
return <div className='roleApp'><RoleHeader title={tab==='home'?'Rider Dashboard':tab==='orders'?'Orders':tab==='earnings'?'Earnings':tab==='wallet'?'Wallet':'Profile'} role='Rider'/><main className='roleBody'>
{tab==='home'&&<><div className='riderTop'><div className='riderAvatar'>{(profile?.name||'R').slice(0,1).toUpperCase()}</div><div><strong>Good morning, {profile?.name?.split(' ')[0]||'Rider'}</strong><small>{online?'Ready to deliver?':'You are offline'}</small></div><button className='onlinePill' onClick={toggle}>● {online?'Online':'Offline'}</button></div><div className='darkPanel'><div className='panelTitle'><h2>Today's Earnings</h2></div><h1 style={{margin:'8px 0 0'}}>{money(todaysEarnings)}</h1><small>{todaysDeliveries.length} deliveries completed</small></div><div className='metricGrid'><Metric label='Rating' value={rating.count?`${rating.average} ★`:'New'}/><Metric label='Acceptance' value='—'/><Metric label='Completion' value='—'/></div><div className='sectionHead'><h2>Quick Actions</h2></div><div className='categoryGrid' style={{gridTemplateColumns:'repeat(4,1fr)'}}><button className='cat' onClick={toggle}><span style={{background:online?'#22c55e':'#ff9a5a'}}><Bell size={18}/></span><small>{online?'Go Offline':'Go Online'}</small></button><button className='cat' onClick={()=>setTab('orders')}><span style={{background:'#5ecbe0'}}><Package size={18}/></span><small>Orders</small></button><button className='cat' onClick={()=>setTab('earnings')}><span style={{background:'#7fd88a'}}><Wallet size={18}/></span><small>Earnings</small></button><button className='cat' onClick={()=>setTab('profile')}><span style={{background:'#c792ea'}}><User size={18}/></span><small>Profile</small></button></div>{myActive&&<OrderActionCard order={myActive} profile={profile} online={online} onClaim={claim} onAdvance={advance} onMessage={setChatOrderId}/>}{!myActive&&online&&available.slice(0,1).map((o:any)=><OrderActionCard key={o.id} order={o} profile={profile} online={online} onClaim={claim} onAdvance={advance} onMessage={setChatOrderId}/>)}{!myActive&&!available.length&&<div className='emptyState'>{online?'No deliveries available right now.':'Go online to start receiving deliveries.'}</div>}</>}
{tab==='orders'&&<><div className='orderTabs'>{['All','Ongoing','Completed','Cancelled'].map(t=><span key={t} className={orderTab===t?'on':''} onClick={()=>setOrderTab(t)}>{t}</span>)}</div>{orders.filter((o:any)=>o.riderId===profile?.userId).filter((o:any)=>orderTab==='All'?true:orderTab==='Ongoing'?!['DELIVERED','CANCELLED'].includes(o.deliveryStatus):orderTab==='Completed'?o.deliveryStatus==='DELIVERED':o.deliveryStatus==='CANCELLED').map((o:any)=><div className='orderCard' key={o.id}><div className='orderIcon'><Package size={18}/></div><div><strong>#{o.id}</strong><small>{o.deliveryAddress}</small></div><div><b>{money(o.deliveryFee||0)}</b><small>{o.deliveryStatus}</small></div></div>)}</>}
{tab==='earnings'&&<><div className='darkPanel'><div className='panelTitle'><h2>Total Earnings</h2></div><h1 style={{margin:'8px 0 0'}}>{money(earnings.earnings||0)}</h1><small>{earnings.completedDeliveries} deliveries · {(earnings.history||[]).reduce((s:number,o:any)=>s+Number(o.deliveryDistanceKm||0),0).toFixed(1)} km total</small></div><div className='panelTitle' style={{marginTop:16}}><h2>History</h2></div>{(earnings.history||[]).slice(0,15).map((o:any)=><div className='darkRow' key={o.id}><div><strong>#{o.id}</strong><small>{new Date(o.deliveredAt).toLocaleDateString()}</small></div><b>{money(o.deliveryFee||0)}</b></div>)}</>}
{tab==='wallet'&&<><div className='darkPanel'><div className='panelTitle'><h2>Available Balance</h2></div><h1 style={{margin:'8px 0 0'}}>{money(earnings.earnings||0)}</h1><div style={{display:'flex',gap:8,marginTop:12}}><button className='purpleBtn small' onClick={()=>setSub('withdraw')}>Withdraw</button><button className='miniPurple' onClick={()=>setTab('earnings')}>History</button></div></div><div className='panelTitle' style={{marginTop:16}}><h2>Wallet Summary</h2></div><div className='darkRow'><div><strong>Total Earnings</strong></div><b>{money(earnings.earnings||0)}</b></div><div className='darkRow'><div><strong>Deliveries Completed</strong></div><b>{earnings.completedDeliveries||0}</b></div></>}
{tab==='profile'&&<><div className='profileHero'><div className='profileAvatar'>{(profile?.name||'R').slice(0,1).toUpperCase()}</div><div><h2>{profile?.name}</h2><p><Star size={11} fill='currentColor'/> {rating.count?rating.average:'New'} · Verified Rider</p></div></div><section className='darkPanel' style={{padding:'6px 8px'}}><button className='menuRow2' onClick={()=>setSub('vehicle')}><Package size={17}/><span>Vehicle Information</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('documents')}><ShieldCheck size={17}/><span>Documents</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('withdraw')}><Wallet size={17}/><span>Bank Details</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('notifications')}><Bell size={17}/><span>Notifications</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('help')}><MessageCircle size={17}/><span>Help &amp; Support</span><ChevronRight size={16}/></button><button className='menuRow2' onClick={()=>setSub('settings')}><Settings size={17}/><span>Settings</span><ChevronRight size={16}/></button></section></>}
</main><RoleNav tab={tab} setTab={setTab} items={['home','orders','earnings','wallet','profile']} icons={[Home,Package,Star,Wallet,User]}/>{notice&&<Toast text={notice} close={()=>setNotice('')}/>}</div>}
function SupportCenterApp({tickets,notice,setNotice,theme,setTheme,signOut}:any){const [tab,setTab]=useState('dashboard');const [selected,setSelected]=useState<any>(null),[query,setQuery]=useState(''),[filterStatus,setFilterStatus]=useState(''),[filterPriority,setFilterPriority]=useState(''),[text,setText]=useState(''),[note,setNote]=useState(''),[refundOrder,setRefundOrder]=useState(''),[refundReason,setRefundReason]=useState(''),[category,setCategory]=useState('Other'),[priority,setPriority]=useState('NORMAL');useEffect(()=>{if(selected){setCategory(selected.category||'Other');setPriority(selected.priority||'NORMAL')}},[selected]);async function act(path:string,body:any,msg:string){try{const r=await api.post(path,body);if(r.data.ticket)setSelected(r.data.ticket);setNotice(msg)}catch(e:any){setNotice(e?.response?.data?.message||'Support action failed.')}}async function reply(){if(!selected||!text.trim())return;await act('/api/support/reply',{ticketId:selected.id,text:text.trim()},'Reply sent.');setText('')}async function saveMeta(){if(!selected)return;await act('/api/support/metadata',{ticketId:selected.id,category,priority},'Ticket updated.')}async function saveNote(){if(!selected||!note.trim())return;await act('/api/support/note',{ticketId:selected.id,text:note.trim()},'Internal note saved.');setNote('')}async function requestRefund(){if(!selected||!refundOrder||!refundReason.trim())return setNotice('Enter the order ID and refund reason.');await act('/api/support/refund-request',{ticketId:selected.id,orderId:refundOrder.trim(),reason:refundReason.trim()},'Refund request sent to Admin.');setRefundReason('')}
const today=new Date().toDateString();const resolvedToday=tickets.filter((t:any)=>t.status==='RESOLVED'&&t.resolvedAt&&new Date(t.resolvedAt).toDateString()===today).length;const ratedTickets=tickets.filter((t:any)=>Number.isFinite(t.satisfactionScore));const avgSatisfaction=ratedTickets.length?(ratedTickets.reduce((s:number,t:any)=>s+Number(t.satisfactionScore),0)/ratedTickets.length).toFixed(1):null;
const filtered=tickets.filter((t:any)=>(!query||JSON.stringify(t).toLowerCase().includes(query.toLowerCase()))&&(!filterStatus||t.status===filterStatus)&&(!filterPriority||t.priority===filterPriority));
if(selected)return <div className='roleApp'><RoleHeader title='Ticket Details' role='' onBack={()=>setSelected(null)}/><main className='roleBody'><section className='chatPreview'><div className='chatHead'><div className='supportAvatar'>S</div><div><strong>{selected.email||'Customer'}</strong><small>{selected.status} · {selected.assignedTo?'Assigned to me':'Unassigned'}</small></div></div>{(selected.replies||[]).map((r:any,i:number)=><div className={'bubble '+(r.sender==='Customer'?'incoming':'outgoing')} key={i}>{r.text}</div>)}<div className='composer'><input value={text} onChange={e=>setText(e.target.value)} placeholder='Type a message...'/><button onClick={reply}><Send size={16}/></button></div><div className='formStack'><div style={{display:'flex',gap:8}}><select className='plainInput' value={category} onChange={e=>setCategory(e.target.value)}><option>Order</option><option>Payment</option><option>Vendor</option><option>Rider</option><option>Account</option><option>Refund</option><option>Other</option></select><select className='plainInput' value={priority} onChange={e=>setPriority(e.target.value)}><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></div><button className='purpleBtn small' onClick={saveMeta}>Save Category & Priority</button><input className='plainInput' value={note} onChange={e=>setNote(e.target.value)} placeholder='Internal note (customer cannot see)'/><button className='purpleBtn small' onClick={saveNote}>Save Internal Note</button><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className='purpleBtn small' onClick={()=>act('/api/support/assign',{ticketId:selected.id},'Ticket assigned to you.')}>Assign to Me</button><button className='purpleBtn small' onClick={()=>act('/api/support/escalate',{ticketId:selected.id,reason:'Escalated by Support'},'Escalated to Admin.')}>Escalate to Admin</button><button className='purpleBtn small' onClick={()=>act('/api/support/reopen',{ticketId:selected.id},'Ticket reopened.')}>Reopen</button><button className='purpleBtn small' onClick={()=>act('/api/support/resolve',{ticketId:selected.id},'Ticket resolved.')}>Resolve</button></div><div className='darkPanel'><strong>Refund Request → Admin</strong><small>Support cannot approve refunds. Admin must decide.</small><input className='plainInput' value={refundOrder} onChange={e=>setRefundOrder(e.target.value)} placeholder='Order ID'/><input className='plainInput' value={refundReason} onChange={e=>setRefundReason(e.target.value)} placeholder='Reason for refund'/><button className='purpleBtn small' onClick={requestRefund}>Send Refund Request to Admin</button></div>{(selected.internalNotes||[]).map((n:any,i:number)=><small key={i}>Internal note: {n.text}</small>)}</div></section></main></div>;
if(tab==='changePassword')return <ChangePasswordScreen back={()=>setTab('help')} setNotice={setNotice}/>;
if(tab==='help')return <div className='roleApp'><RoleHeader title='Help Center' role='' onBack={()=>setTab('dashboard')}/><main className='roleBody'><div className='searchInput'><Search size={17}/><input placeholder='Search for answers...'/></div><div className='panelTitle' style={{marginTop:10}}><h2>Popular Topics</h2></div>{[['How to assign a ticket','Open a ticket and tap Assign to Me to take ownership.'],['Escalating to Admin','Use Escalate to Admin for issues you cannot resolve, such as refunds.'],['Internal notes','Notes are only visible to Support and Admin, never the customer.']].map((f,i)=><div key={i} className='darkRow' style={{flexDirection:'column',alignItems:'flex-start'}}><strong>{f[0]}</strong><small style={{marginTop:6}}>{f[1]}</small></div>)}<div className='panelTitle' style={{marginTop:16}}><h2>Settings</h2></div><button className='settingsRow' onClick={()=>setTab('changePassword')}><span>Change Password</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span>Appearance ({theme==='dark'?'Dark':'Light'})</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={signOut}><span>Logout</span><ChevronRight size={16}/></button></main></div>;
return <div className='roleApp'><RoleHeader title={tab==='dashboard'?'Dashboard':tab==='tickets'?'Tickets':'Chats'} role='Support'/><main className='roleBody'>
{tab==='dashboard'&&<><div className='adminStats'><Metric label='Open Tickets' value={String(tickets.filter((t:any)=>t.status==='OPEN').length)}/><Metric label='In Progress' value={String(tickets.filter((t:any)=>t.status==='IN_PROGRESS').length)}/><Metric label='Resolved Today' value={String(resolvedToday)}/><Metric label='Satisfaction' value={avgSatisfaction?`${avgSatisfaction} ★`:'No ratings yet'}/></div><div className='sectionHead'><h2>Recent Tickets</h2><button onClick={()=>setTab('tickets')}>See all</button></div>{tickets.slice(0,5).map((t:any)=><button className='ticketRow' key={t.id} onClick={()=>setSelected(t)}><div className='supportAvatar small'>S</div><div><strong>{t.name||t.email||'Customer'}</strong><small>{t.subject||'Customer support'}</small></div><span>{t.status}</span></button>)}</>}
{(tab==='tickets'||tab==='chats')&&<><div className='supportTabs'><b>Open ({tickets.filter((t:any)=>t.status==='OPEN').length})</b><span>In Progress ({tickets.filter((t:any)=>t.status==='IN_PROGRESS').length})</span><span>Escalated ({tickets.filter((t:any)=>t.status==='ESCALATED').length})</span><span>Resolved ({tickets.filter((t:any)=>t.status==='RESOLVED').length})</span></div><div style={{display:'flex',gap:8,marginBottom:10}}><input className='plainInput' value={query} onChange={e=>setQuery(e.target.value)} placeholder='Search tickets'/><select className='plainInput' value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value=''>All status</option><option>OPEN</option><option>IN_PROGRESS</option><option>ESCALATED</option><option>RESOLVED</option></select><select className='plainInput' value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}><option value=''>All priority</option><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></div><section className='darkPanel'>{!filtered.length&&<div className='emptyState'>No tickets match.</div>}{filtered.map((t:any)=><button className='ticketRow' key={t.id} onClick={()=>setSelected(t)}><div className='supportAvatar small'>S</div><div><strong>{t.name||t.email||'Customer'}</strong><small>{t.subject||'Customer support'} · {t.category||'Other'} · {t.priority||'NORMAL'}</small></div><span>{t.status}</span></button>)}</section></>}
</main><RoleNav tab={tab} setTab={setTab} items={['dashboard','tickets','chats','help']} icons={[Home,Package,MessageCircle,ShieldCheck]}/>{notice&&<Toast text={notice} close={()=>setNotice('')}/>}</div>}
function StaffPanel({role,title,setNotice}:any){const [staff,setStaff]=useState<any[]>([]),[invites,setInvites]=useState<any[]>([]),[name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');const base=`/api/admin/${role}-staff`;const load=async()=>{try{const r=await api.get(base);setStaff(r.data.staff||[]);setInvites(r.data.invites||[])}catch(e:any){setNotice(e?.response?.data?.message||`Could not load ${title}.`)}};useEffect(()=>{load()},[role]);async function invite(){if(!name.trim()||!email.trim())return setNotice('Name and email are required.');try{await api.post(base+'/invite',{name,email,phone});setName('');setEmail('');setPhone('');await load();setNotice('Invitation created.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not create invitation.')}}async function action(id:string,a:string){const reason=window.prompt('Reason for '+a+':');if(!reason?.trim())return;try{await api.post(base+'/action',{id,action:a,reason});await load();setNotice(`${title} updated.`)}catch(e:any){setNotice(e?.response?.data?.message||'Action failed.')}}return <section className='darkPanel'><div className='panelTitle'><h2>{title}</h2><span>{staff.length} staff</span></div><p>Invite and control {title.toLowerCase()}. The invited person signs up normally (picking "Customer" during signup) and is auto-promoted to {role} the first time they log in.</p><div className='formStack'><input className='plainInput' value={name} onChange={e=>setName(e.target.value)} placeholder='Full name'/><input className='plainInput' value={email} onChange={e=>setEmail(e.target.value)} placeholder='Email' type='email'/><input className='plainInput' value={phone} onChange={e=>setPhone(e.target.value)} placeholder='Phone (optional)'/><button className='purpleBtn' onClick={invite}>Invite {title}</button></div>{invites.map((x:any)=><div className='darkRow' key={x.id}><div><strong>{x.name}</strong><small>{x.email} · Invitation {x.status}</small></div></div>)}{staff.map((x:any)=><div className='darkRow' key={x.id}><div><strong>{x.name||title}</strong><small>{x.email||''} · {x.status||'approved'}</small></div><div>{x.status==='suspended'?<button className='miniPurple' onClick={()=>action(x.id,'restore')}>Restore</button>:x.status!=='deactivated'&&<button className='miniPurple' onClick={()=>action(x.id,'suspend')}>Suspend</button>}{x.status!=='deactivated'&&<button className='miniPurple' onClick={()=>action(x.id,'deactivate')}>Remove</button>}</div></div>)}</section>}

function DispatchApp({notice,setNotice,theme,setTheme,signOut}:any){
  const [tab,setTab]=useState('queue');
  const [queue,setQueue]=useState<any[]>([]);
  const [riders,setRiders]=useState<any[]>([]);
  const [picks,setPicks]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState('');

  const load=async()=>{try{const [q,r]=await Promise.all([api.get('/api/dispatch/queue'),api.get('/api/dispatch/riders')]);setQueue(q.data.items||[]);setRiders(r.data.items||[])}catch(e:any){setNotice(e?.response?.data?.message||'Could not load dispatch data.')}};
  useEffect(()=>{load();const t=window.setInterval(load,15000);return()=>window.clearInterval(t)},[]);

  async function assign(orderId:string,currentRiderId?:string){
    const riderId=picks[orderId];
    if(!riderId)return setNotice('Pick a rider first.');
    let reason='';
    if(currentRiderId&&currentRiderId!==riderId){
      reason=window.prompt('Reason for reassigning this order:')||'';
      if(!reason.trim())return;
    }
    setBusy(orderId);
    try{await api.post('/api/dispatch/assign',{orderId,riderId,reason});await load();setNotice('Rider assigned.')}
    catch(e:any){setNotice(e?.response?.data?.message||'Could not assign rider.')}
    finally{setBusy('')}
  }
  async function unassign(orderId:string){
    const reason=window.prompt('Reason for unassigning this order:');
    if(!reason?.trim())return;
    setBusy(orderId);
    try{await api.post('/api/dispatch/unassign',{orderId,reason});await load();setNotice('Rider unassigned.')}
    catch(e:any){setNotice(e?.response?.data?.message||'Could not unassign rider.')}
    finally{setBusy('')}
  }

  if(tab==='changePassword')return <ChangePasswordScreen back={()=>setTab('settings')} setNotice={setNotice}/>;

  return <div className='roleApp'>
    <RoleHeader title='Dispatch' role='Dispatch Manager'/>
    <main className='roleBody'>
      {tab==='queue'&&<section className='darkPanel'>
        <div className='panelTitle'><h2>Delivery Queue</h2><span>{queue.length} active</span></div>
        {!queue.length&&<small>No active orders right now.</small>}
        {queue.map((o:any)=><div className='darkRow' key={o.id} style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <div><strong>#{o.id}</strong><small> {o.vendorName} → {o.customerName}</small></div>
            <small>{o.deliveryStatus}</small>
          </div>
          <small>{o.riderName?`Rider: ${o.riderName}${o.riderOnline?'':' (offline)'}`:'Unassigned'}</small>
          <div style={{display:'flex',gap:6}}>
            <select className='plainInput' value={picks[o.id]||o.riderId||''} onChange={e=>setPicks({...picks,[o.id]:e.target.value})}>
              <option value=''>Select rider…</option>
              {riders.map((r:any)=><option key={r.userId} value={r.userId}>{r.name}{r.online?' • online':' • offline'} ({r.activeDeliveries} active)</option>)}
            </select>
            <button className='miniPurple' disabled={busy===o.id} onClick={()=>assign(o.id,o.riderId)}>{o.riderId?'Reassign':'Assign'}</button>
            {o.riderId&&!['PICKED_UP','ON_THE_WAY'].includes(o.deliveryStatus)&&<button className='miniPurple' disabled={busy===o.id} onClick={()=>unassign(o.id)}>Unassign</button>}
          </div>
        </div>)}
      </section>}
      {tab==='riders'&&<section className='darkPanel'>
        <div className='panelTitle'><h2>Riders</h2><span>{riders.filter((r:any)=>r.online).length} online</span></div>
        {!riders.length&&<small>No approved riders yet.</small>}
        {riders.map((r:any)=><div className='darkRow' key={r.userId}>
          <div><strong>{r.name}</strong><small>{r.online?'Online':'Offline'} · {r.activeDeliveries} active {r.activeDeliveries===1?'delivery':'deliveries'}</small></div>
        </div>)}
      </section>}
      {tab==='settings'&&<section className='darkPanel'>
        <div className='panelTitle'><h2>Settings</h2></div>
        <button className='settingsRow' onClick={()=>(window as any).conectOpenVerify?.()}><span>Verify Email &amp; Phone</span><ChevronRight size={16}/></button>
        <button className='settingsRow' onClick={()=>setTab('changePassword')}><span>Change Password</span><ChevronRight size={16}/></button>
        <button className='settingsRow' onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span>Appearance ({theme==='dark'?'Dark':'Light'})</span><ChevronRight size={16}/></button>
        <button className='settingsRow' onClick={signOut}><span>Logout</span><ChevronRight size={16}/></button>
      </section>}
    </main>
    <RoleNav tab={tab} setTab={setTab} items={['queue','riders','settings']} icons={[Package,User,Settings]}/>
    {notice&&<Toast text={notice} close={()=>setNotice('')}/>}
  </div>;
}
function AdminControlApp({
  tab,
  setTab,
  notice,
  setNotice,
  signOut,
  theme,
  setTheme
}:any){
const [requests,setRequests]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]),[refunds,setRefunds]=useState<any[]>([]),[finance,setFinance]=useState<any>({}),[reviews,setReviews]=useState<any[]>([]),[q,setQ]=useState(''),[roleFilter,setRoleFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[selected,setSelected]=useState<any>(null),[coupons,setCoupons]=useState<any[]>([]),[gifts,setGifts]=useState<any[]>([]),[newCoupon,setNewCoupon]=useState<any>({code:'',type:'percent',value:'',maxUses:''}),[giftForm,setGiftForm]=useState<any>({userId:'',amount:'',reason:''});const [zones,setZones]=useState<any[]>([]),[newZone,setNewZone]=useState<any>({name:'',lat:'',lng:'',radiusKm:''});const [payouts,setPayouts]=useState<any[]>([]);const [sub,setSub]=useState('');const [pricing,setPricing]=useState({baseFee:'',perKm:'',minFee:''});const [pricingSaving,setPricingSaving]=useState(false);const [platform,setPlatform]=useState({commissionPct:'',minOrderAmount:'',maintenanceMode:false});const [platformLoaded,setPlatformLoaded]=useState(false);const [platformSaving,setPlatformSaving]=useState(false);const [audit,setAudit]=useState<any[]>([]);const load=async()=>{try{const [r,o,u,f,fin,rv,cp,gf,zn,po]=await Promise.all([api.get('/api/admin/role-requests'),api.get('/api/orders'),api.get('/api/admin/users',{q,role:roleFilter,status:statusFilter}),api.get('/api/admin/refund-requests'),api.get('/api/admin/finance'),api.get('/api/admin/reviews'),api.get('/api/admin/coupons'),api.get('/api/admin/gifts'),api.get('/api/admin/delivery/zones'),api.get('/api/admin/payouts')]);setRequests(r.data.items||[]);setOrders(o.data.items||[]);setUsers(u.data.items||[]);setRefunds(f.data.items||[]);setFinance(fin.data||{});setReviews(rv.data.items||[]);setCoupons(cp.data.items||[]);setGifts(gf.data.items||[]);setZones(zn.data.items||[]);setPayouts(po.data.items||[])}catch{}};useEffect(()=>{load()},[]);async function addZone(){if(!newZone.name.trim()||!newZone.lat||!newZone.lng||!newZone.radiusKm)return setNotice('Zone name, GPS coordinates and radius are required.');try{await api.post('/api/admin/delivery/zones',{name:newZone.name.trim(),lat:Number(newZone.lat),lng:Number(newZone.lng),radiusKm:Number(newZone.radiusKm)});setNewZone({name:'',lat:'',lng:'',radiusKm:''});await load();setNotice('No-delivery zone added.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not add zone.')}}async function removeZone(id:string){try{await api.delete('/api/admin/delivery/zones',{id});await load();setNotice('Zone removed.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not remove zone.')}}async function createCoupon(){if(!newCoupon.code.trim()||!newCoupon.value)return setNotice('Coupon code and value are required.');try{await api.post('/api/admin/coupons',{code:newCoupon.code.trim(),type:newCoupon.type,value:Number(newCoupon.value),maxUses:newCoupon.maxUses?Number(newCoupon.maxUses):undefined});setNewCoupon({code:'',type:'percent',value:'',maxUses:''});await load();setNotice('Coupon created.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not create coupon.')}}async function toggleCoupon(id:string){try{await api.post('/api/admin/coupons/toggle',{id});await load()}catch(e:any){setNotice(e?.response?.data?.message||'Could not update coupon.')}}async function sendGift(){if(!giftForm.userId||!giftForm.amount)return setNotice('Select a customer and enter an amount.');try{await api.post('/api/admin/gift',{userId:giftForm.userId,amount:Number(giftForm.amount),reason:giftForm.reason||undefined});setGiftForm({userId:'',amount:'',reason:''});await load();setNotice('Gift sent to customer wallet.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not send gift.')}}async function setUserRole(id:string){const role=window.prompt('New role (customer, vendor, rider, admin, support, dispatch):');if(!role)return;const reason=window.prompt('Reason for this role change:');if(!reason?.trim())return;try{await api.post('/api/admin/users/action',{id,action:'setrole',role,reason});await load();setNotice(`Role updated to ${role}.`)}catch(e:any){setNotice(e?.response?.data?.message||'Could not update role.')}}async function decide(id:string,decision:string){try{await api.post('/api/admin/role-requests/decision',{id,decision});await load();setNotice(`Request ${decision}d.`)}catch(e:any){setNotice(e?.response?.data?.message||'Could not update request.')}}async function orderAction(id:string,status:string){try{await api.post('/api/orders/status',{orderId:id,status});await load();setNotice(`Order marked ${status.toLowerCase()}.`)}catch(e:any){setNotice(e?.response?.data?.message||'Could not update order.')}}async function userAction(id:string,action:string){const reason=window.prompt(`Reason for ${action}:`);if(!reason?.trim())return;try{await api.post('/api/admin/users/action',{id,action,reason});await load();setNotice(`User ${action}ed.`)}catch(e:any){setNotice(e?.response?.data?.message||'Could not update user.')}}async function viewUser(id:string){try{const r=await api.get('/api/admin/users/'+id);setSelected(r.data)}catch(e:any){setNotice(e?.response?.data?.message||'Could not load user.')}}async function refundDecision(id:string,decision:string){const reason=window.prompt(`Reason for ${decision}ing refund:`)||'';try{await api.post('/api/admin/refund-requests/decision',{id,decision,reason});await load();setNotice(`Refund request ${decision}d.`)}catch(e:any){setNotice(e?.response?.data?.message||'Could not update refund request.')}}
async function loadPricing(){try{const r=await api.get('/api/delivery/pricing');setPricing({baseFee:String(r.data.baseFee),perKm:String(r.data.perKm),minFee:String(r.data.minFee)})}catch{}}
async function savePricing(){setPricingSaving(true);try{await api.put('/api/admin/delivery/pricing',{baseFee:Number(pricing.baseFee),perKm:Number(pricing.perKm),minFee:Number(pricing.minFee)});setNotice('Delivery pricing updated.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not update pricing.')}finally{setPricingSaving(false)}}
async function loadPlatformSettings(){try{const r=await api.get('/api/admin/platform-settings');setPlatform({commissionPct:String(r.data.commissionPct),minOrderAmount:String(r.data.minOrderAmount),maintenanceMode:Boolean(r.data.maintenanceMode)});setPlatformLoaded(true)}catch{}}
async function savePlatformSettings(){setPlatformSaving(true);try{await api.put('/api/admin/platform-settings',{commissionPct:Number(platform.commissionPct),minOrderAmount:Number(platform.minOrderAmount),maintenanceMode:platform.maintenanceMode});setNotice('Platform settings updated.')}catch(e:any){setNotice(e?.response?.data?.message||'Could not update platform settings.')}finally{setPlatformSaving(false)}}
async function loadAudit(){try{const r=await api.get('/api/admin/audit');setAudit(r.data.items||[])}catch{}}
const pendingVendors=requests.filter((x:any)=>x.role==='vendor');const approvedVendors=users.filter((u:any)=>u.role==='vendor'&&u.status==='approved');const monthOrders=orders.filter((o:any)=>o.paymentStatus==='PAID');
if(sub==='deliverySettings'){if(!pricing.baseFee)loadPricing();return <div className='roleApp'><RoleHeader title='Delivery Settings' role='' onBack={()=>setSub('')}/><main className='roleBody'><div className='formStack'><label className='radioRow' style={{display:'block'}}><small>Base Fee (₦)</small><input className='plainInput' type='number' value={pricing.baseFee} onChange={e=>setPricing({...pricing,baseFee:e.target.value})}/></label><label className='radioRow' style={{display:'block'}}><small>Per KM Fee (₦)</small><input className='plainInput' type='number' value={pricing.perKm} onChange={e=>setPricing({...pricing,perKm:e.target.value})}/></label><label className='radioRow' style={{display:'block'}}><small>Minimum Fee (₦)</small><input className='plainInput' type='number' value={pricing.minFee} onChange={e=>setPricing({...pricing,minFee:e.target.value})}/></label><button className='purpleBtn wide' onClick={savePricing} disabled={pricingSaving}>{pricingSaving?'Saving...':'Save Changes'}</button></div></main></div>}
if(sub==='platformSettings'){if(!platformLoaded)loadPlatformSettings();return <div className='roleApp'><RoleHeader title='Platform Settings' role='' onBack={()=>setSub('')}/><main className='roleBody'><div className='formStack'><label className='radioRow' style={{display:'block'}}><small>Platform Commission (%)</small><input className='plainInput' type='number' value={platform.commissionPct} onChange={e=>setPlatform({...platform,commissionPct:e.target.value})}/></label><label className='radioRow' style={{display:'block'}}><small>Minimum Order Amount (₦)</small><input className='plainInput' type='number' value={platform.minOrderAmount} onChange={e=>setPlatform({...platform,minOrderAmount:e.target.value})}/></label><label className='radioRow'><input type='checkbox' checked={platform.maintenanceMode} onChange={e=>setPlatform({...platform,maintenanceMode:e.target.checked})}/><div><strong>Maintenance Mode</strong><small>Pauses new orders platform-wide with a clear message to customers. Browsing, tracking and support still work.</small></div></label><button className='purpleBtn wide' onClick={savePlatformSettings} disabled={platformSaving}>{platformSaving?'Saving...':'Save Changes'}</button></div></main></div>}
if(sub==='manageAdmins'){const admins=users.filter((u:any)=>u.role==='admin');return <div className='roleApp'><RoleHeader title='Manage Admins' role='' onBack={()=>setSub('')}/><main className='roleBody'>{admins.map((u:any)=><div className='darkRow' key={u.id}><div><strong>{u.name} {u.protected?'🛡️':''}</strong><small>{u.email}</small></div></div>)}<button className='purpleBtn wide' style={{marginTop:12}} onClick={()=>{const id=window.prompt('Enter the user ID to promote to admin:');if(id)setUserRole(id)}}>+ Add Admin (by User ID)</button></main></div>}
if(sub==='logs'){if(!audit.length)loadAudit();return <div className='roleApp'><RoleHeader title='Logs & Activity' role='' onBack={()=>setSub('')}/><main className='roleBody'>{!audit.length&&<div className='emptyState'>No activity logged yet.</div>}{audit.map((a:any)=><div className='darkRow' key={a.id}><div><strong>{a.action}</strong><small>{a.reason||''} · {new Date(a.createdAt).toLocaleString()}</small></div></div>)}</main></div>}
if(sub==='changePassword')return <ChangePasswordScreen back={()=>setSub('settings')} setNotice={setNotice}/>;
if(sub==='settings')return <div className='roleApp'><RoleHeader title='Settings' role='' onBack={()=>setSub('')}/><main className='roleBody'><button className='settingsRow' onClick={()=>setSub('platformSettings')}><span>Platform Settings</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('deliverySettings')}><span>Delivery Settings</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>{setTab('coupons');setSub('')}}><span>Coupons &amp; Gifts</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>{setTab('payouts');setSub('')}}><span>Payouts</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>{setTab('zones');setSub('')}}><span>No-Delivery Zones</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>{setTab('reviews');setSub('')}}><span>Review Moderation</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>{setTab('support');setSub('')}}><span>Support Staff</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>{setTab('dispatchStaff');setSub('')}}><span>Dispatch Staff</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('manageAdmins')}><span>Manage Admins</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('logs')}><span>Logs &amp; Activity</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>(window as any).conectOpenVerify?.()}><span>Verify Email &amp; Phone</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setSub('changePassword')}><span>Change Password</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={()=>setTheme(theme==='dark'?'light':'dark')}><span>Appearance ({theme==='dark'?'Dark':'Light'})</span><ChevronRight size={16}/></button><button className='settingsRow' onClick={signOut}><span>Logout</span><ChevronRight size={16}/></button></main></div>;
return <div className='roleApp'><RoleHeader title={tab==='dashboard'?'Dashboard':tab==='orders'?'Orders':tab==='users'?'Users':tab==='vendors'?'Vendors':'Finance'} role='Admin'/><main className='roleBody'>
{tab==='dashboard'&&<><div className='adminStats'><Metric label='Total Orders' value={String(orders.length)}/><Metric label='Total Sales' value={money(finance.gross||0)}/><Metric label='Total Users' value={String(users.length)}/></div><div className='sectionHead'><h2>Recent Orders</h2><button onClick={()=>setTab('orders')}>See all</button></div>{orders.slice(0,5).map((o:any)=><div className='darkRow' key={o.id}><div><strong>#{o.id}</strong><small>{money(o.total)} · {o.status}</small></div></div>)}<button className='menuRow2' style={{marginTop:8}} onClick={()=>setSub('settings')}><Settings size={17}/><span>Settings</span><ChevronRight size={16}/></button></>}
{tab==='vendors'&&<><div className='orderTabs'><span className='on'>Pending ({pendingVendors.length})</span></div>{!pendingVendors.length&&<div className='emptyState'>No pending vendor applications.</div>}{pendingVendors.map((x:any)=><div className='darkRow' key={x.id}><div><strong>{x.name||x.email}</strong><small>{x.phone||'Verification submitted'}</small></div><button className='miniPurple' onClick={()=>decide(x.id,'approve')}>Approve</button><button className='miniPurple' onClick={()=>decide(x.id,'reject')}>Reject</button></div>)}<div className='panelTitle' style={{marginTop:16}}><h2>Approved Vendors</h2></div>{approvedVendors.map((u:any)=><div className='darkRow' key={u.id}><div><strong>{u.name}</strong><small>{u.email}</small></div><button className='miniPurple' onClick={()=>viewUser(u.id)}>View</button></div>)}</>}
{tab==='finance'&&<section className='darkPanel'><div className='panelTitle'><h2>Finance</h2></div><div className='metricGrid'><Metric label='Gross sales' value={money(finance.gross||0)}/><Metric label='Platform fees' value={money(finance.platformRevenue||0)}/><Metric label='Refunded' value={money(finance.refunded||0)}/><Metric label='Net revenue' value={money(finance.netRevenue||0)}/></div></section>}{tab==='reviews'&&<section className='darkPanel'><div className='panelTitle'><h2>Review Moderation</h2><span>{reviews.length}</span></div>{reviews.map((r:any)=><div className='darkRow' key={r.id}><div><strong>{r.score} ★ · {r.targetType}</strong><small>{r.comment||'No written review'}</small></div><button className='miniPurple' onClick={async()=>{await api.post('/api/admin/reviews/moderate',{id:r.id,action:r.moderated?'restore':'hide'});await load()}}>{r.moderated?'Restore':'Hide'}</button></div>)}</section>}{tab==='refunds'&&<section className='darkPanel'><div className='panelTitle'><h2>Refund Requests</h2><span>{refunds.filter(r=>r.status==='PENDING').length} pending</span></div>{refunds.map(r=><div className='darkRow' key={r.id}><div><strong>Order #{r.orderId}</strong><small>₦{Number(r.amount||0).toLocaleString()} · {r.status} · {r.reason}</small></div>{r.status==='PENDING'&&<div><button className='miniPurple' onClick={()=>refundDecision(r.id,'approve')}>Approve</button><button className='miniPurple' onClick={()=>refundDecision(r.id,'reject')}>Reject</button></div>}</div>)}</section>}{tab==='users'&&<section className='darkPanel'><div className='panelTitle'><h2>User Management <span>{users.length}</span></h2></div><div className='formStack'><input className='plainInput' value={q} onChange={e=>setQ(e.target.value)} placeholder='Search name, email or phone'/><select className='plainInput' value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value=''>All roles</option><option value='customer'>Customers</option><option value='vendor'>Vendors</option><option value='rider'>Riders</option><option value='support'>Support</option><option value='dispatch'>Dispatch</option><option value='admin'>Admins</option></select><select className='plainInput' value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value=''>All statuses</option><option value='approved'>Active</option><option value='pending'>Pending</option><option value='suspended'>Suspended</option><option value='deactivated'>Removed</option></select><button className='purpleBtn' onClick={load}>Search Users</button></div>{users.map(u=><div className='darkRow' key={u.id}><div><strong>{u.name||'Unnamed'} {u.protected?'🛡️':''}</strong><small>{u.email||u.phone||'No contact'} · {u.role} · {u.status}</small></div><div><button className='miniPurple' onClick={()=>viewUser(u.id)}>View</button>{!u.protected&&<button className='miniPurple' onClick={()=>setUserRole(u.userId)}>Set Role</button>}{!u.protected&&u.status!=='suspended'&&u.status!=='deactivated'&&<button className='miniPurple' onClick={()=>userAction(u.id,'suspend')}>Suspend</button>}{!u.protected&&u.status==='suspended'&&<button className='miniPurple' onClick={()=>userAction(u.id,'unsuspend')}>Restore</button>}{!u.protected&&u.status!=='deactivated'&&<button className='miniPurple' onClick={()=>userAction(u.id,'deactivate')}>Remove</button>}</div></div>)}{selected&&<div className='darkPanel'><div className='panelTitle'><h2>{selected.user?.name||'User details'}</h2><button className='miniPurple' onClick={()=>setSelected(null)}>Close</button></div><p>{selected.user?.email||''} · {selected.user?.phone||''}</p><p>Role: {selected.user?.role} · Status: {selected.user?.status}</p><p>Orders/activity: {selected.orders?.length||0} records · Role requests: {selected.roleRequests?.length||0}</p>{selected.user?.role==='vendor'&&<div style={{marginTop:8}}><small><strong>Vendor documents:</strong></small>{(selected.vendorDocuments||[]).length?(selected.vendorDocuments||[]).map((d:any)=><small key={d.id} style={{display:'block'}}>• {d.documentType} — {d.status} ({d.fileName})</small>):<small style={{display:'block'}}>None submitted yet</small>}</div>}{selected.user?.role==='rider'&&<div style={{marginTop:8}}><small><strong>Vehicle:</strong> {selected.user?.plateNumber?`${selected.user?.vehicleType||''} · ${selected.user?.plateNumber}`:'Not submitted'}</small><br/><small><strong>Rider documents:</strong></small>{(selected.riderDocuments||[]).length?(selected.riderDocuments||[]).map((d:any)=><small key={d.id} style={{display:'block'}}>• {d.documentType} — {d.status} ({d.fileName})</small>):<small style={{display:'block'}}>None submitted yet</small>}</div>}</div>}</section>}{tab==='orders'&&<section className='darkPanel'><div className='panelTitle'><h2>Orders</h2></div>{orders.map(o=><div className='darkRow' key={o.id}><div><strong>#{o.id}</strong><small>{o.deliveryStatus} · ₦{Number(o.total||0).toLocaleString()}</small></div>{o.paymentStatus==='PAID'&&o.deliveryStatus!=='DELIVERED'?<button className='miniPurple' onClick={()=>orderAction(o.id,'CANCELLED')}>Cancel</button>:null}</div>)}</section>}{tab==='coupons'&&<section className='darkPanel'><div className='panelTitle'><h2>Coupons &amp; Gifts</h2></div><div className='formStack'><input className='plainInput' value={newCoupon.code} onChange={e=>setNewCoupon({...newCoupon,code:e.target.value.toUpperCase()})} placeholder='Coupon code, e.g. WELCOME10'/><select className='plainInput' value={newCoupon.type} onChange={e=>setNewCoupon({...newCoupon,type:e.target.value})}><option value='percent'>Percent off</option><option value='fixed'>Fixed amount off</option></select><input className='plainInput' type='number' value={newCoupon.value} onChange={e=>setNewCoupon({...newCoupon,value:e.target.value})} placeholder={newCoupon.type==='percent'?'e.g. 10 for 10%':'e.g. 500 for ₦500 off'}/><input className='plainInput' type='number' value={newCoupon.maxUses} onChange={e=>setNewCoupon({...newCoupon,maxUses:e.target.value})} placeholder='Max uses (optional)'/><button className='purpleBtn' onClick={createCoupon}>Create Coupon</button></div>{coupons.map((c:any)=><div className='darkRow' key={c.id}><div><strong>{c.code}</strong><small>{c.type==='percent'?`${c.value}% off`:money(c.value)+' off'} · used {c.usedCount||0}{c.maxUses?`/${c.maxUses}`:''} · {c.active?'Active':'Disabled'}</small></div><button className='miniPurple' onClick={()=>toggleCoupon(c.id)}>{c.active?'Disable':'Enable'}</button></div>)}<div className='panelTitle' style={{marginTop:16}}><h2>Award a Gift</h2></div><div className='formStack'><select className='plainInput' value={giftForm.userId} onChange={e=>setGiftForm({...giftForm,userId:e.target.value})}><option value=''>Select customer</option>{users.filter((u:any)=>u.role==='customer').map((u:any)=><option key={u.userId} value={u.userId}>{u.name||u.email||u.userId}</option>)}</select><input className='plainInput' type='number' value={giftForm.amount} onChange={e=>setGiftForm({...giftForm,amount:e.target.value})} placeholder='Amount (₦)'/><input className='plainInput' value={giftForm.reason} onChange={e=>setGiftForm({...giftForm,reason:e.target.value})} placeholder='Reason (optional)'/><button className='purpleBtn' onClick={sendGift}>Send Gift</button></div>{gifts.slice(-10).reverse().map((g:any)=><div className='darkRow' key={g.id}><div><strong>{money(g.amount)}</strong><small>{g.reason} · {new Date(g.createdAt).toLocaleDateString()}</small></div></div>)}</section>}{tab==='zones'&&<section className='darkPanel'><div className='panelTitle'><h2>No-Delivery Zones</h2></div><div className='formStack'><input className='plainInput' value={newZone.name} onChange={e=>setNewZone({...newZone,name:e.target.value})} placeholder='Zone name'/><input className='plainInput' type='number' value={newZone.lat} onChange={e=>setNewZone({...newZone,lat:e.target.value})} placeholder='Latitude'/><input className='plainInput' type='number' value={newZone.lng} onChange={e=>setNewZone({...newZone,lng:e.target.value})} placeholder='Longitude'/><input className='plainInput' type='number' value={newZone.radiusKm} onChange={e=>setNewZone({...newZone,radiusKm:e.target.value})} placeholder='Radius (km)'/><button className='purpleBtn' onClick={addZone}>Add Zone</button></div>{!zones.length&&<small>No restricted zones configured.</small>}{zones.map((z:any)=><div className='darkRow' key={z.id}><div><strong>{z.name}</strong><small>{z.lat}, {z.lng} · {z.radiusKm}km radius</small></div><button className='miniPurple' onClick={()=>removeZone(z.id)}>Remove</button></div>)}</section>}{tab==='payouts'&&<section className='darkPanel'><div className='panelTitle'><h2>Withdrawal History</h2><span>{payouts.filter((p:any)=>p.status==='PROCESSING').length} processing</span></div>{!payouts.length&&<small>No payout requests yet.</small>}{payouts.map((p:any)=><div className='darkRow' key={p.id}><div><strong>{money(p.amount)} · {p.role}</strong><small>{p.accountName} · {p.bankName} · {p.accountNumber} · {p.status}{p.failureReason?` · ${p.failureReason}`:''}</small></div></div>)}</section>}{tab==='support'&&<StaffPanel role='support' title='Support Staff' setNotice={setNotice}/>}{tab==='dispatchStaff'&&<StaffPanel role='dispatch' title='Dispatch Staff' setNotice={setNotice}/>}
</main><RoleNav tab={tab} setTab={setTab} items={['dashboard','orders','users','vendors','finance']} icons={[Home,Package,User,Store,Wallet]}/>{notice&&<Toast text={notice} close={()=>setNotice('')}/>}</div>}
function Toast({text,close}:any){return <div className='toast'><span>{text}</span><button onClick={close}><X size={15}/></button></div>}
