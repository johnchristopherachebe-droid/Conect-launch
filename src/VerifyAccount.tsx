import { useEffect, useState } from 'react';
import { ArrowRight, Check, Mail, Phone, ShieldCheck } from 'lucide-react';

export default function VerifyAccount({ user, api, notice, setNotice, onDone, signOut }: any) {
  const [phone, setPhone] = useState(user?.phone || '');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(Boolean(user?.emailVerified));
  const [phoneVerified, setPhoneVerified] = useState(Boolean(user?.phoneVerified));
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!resendCooldown) return;
    const t = window.setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!otpCooldown) return;
    const t = window.setInterval(() => setOtpCooldown(s => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [otpCooldown]);

  async function resendEmail() {
    if (resendCooldown) return;
    setBusy('email');
    setNotice('');
    try {
      await api.post('/api/auth/resend-verification', { email: user?.email });
      setNotice(`Verification link sent to ${user?.email}.`);
      setResendCooldown(60);
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'Could not resend verification email.');
    } finally {
      setBusy('');
    }
  }

  async function sendOtp() {
    if (otpCooldown) return;
    if (phone.trim().length < 7) {
      setNotice('Enter a valid phone number.');
      return;
    }
    setBusy('phone');
    setNotice('');
    try {
      await api.post('/api/auth/send-phone-otp', { phone: phone.trim() });
      setOtpSent(true);
      setOtpCooldown(60);
      setNotice('A verification code has been sent by SMS.');
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'Could not send verification code.');
    } finally {
      setBusy('');
    }
  }

  async function verifyOtp() {
    if (!code.trim()) {
      setNotice('Enter the code you received.');
      return;
    }
    setBusy('verify');
    setNotice('');
    try {
      await api.post('/api/auth/verify-phone-otp', { code: code.trim() });
      setPhoneVerified(true);
      setNotice('Phone number verified.');
    } catch (e: any) {
      setNotice(e?.response?.data?.message || 'Incorrect or expired code.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className='authScreen'>
      <div className='authGlow' />

      <div className='authCard'>
        <div className='authBrand'>
          <div className='miniBrand'>
            <span className='logoMark small'>
              <span className='logoInfinity'>c</span>
              <span className='logoPin'>⌖</span>
              <span className='logoSpeed'>≋</span>
            </span>
            <b>cönëct</b>
          </div>
          <span className='step'>Verify account</span>
        </div>

        <h1>Verify your account</h1>
        <p>You must verify your email and phone number before you can use cönëct.</p>

        {notice && <div className='authNotice'>{notice}</div>}

        <div className='formStack'>

          {/* EMAIL */}
          <div className='darkPanel' style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={16} />
              <strong style={{ flex: 1 }}>{user?.email}</strong>
              {emailVerified ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2ecc71' }}>
                  <Check size={16} /> Verified
                </span>
              ) : null}
            </div>

            {!emailVerified && (
              <>
                <small>We emailed you a verification link. Click it, then come back here.</small>
                <button
                  className='authLink'
                  type='button'
                  disabled={busy === 'email' || resendCooldown > 0}
                  onClick={resendEmail}
                  style={{ marginTop: 8 }}
                >
                  {resendCooldown > 0 ? `Resend link (${resendCooldown}s)` : 'Resend verification link'}
                </button>
              </>
            )}
          </div>

          {/* PHONE */}
          <div className='darkPanel' style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={16} />
              <strong style={{ flex: 1 }}>Phone number</strong>
              {phoneVerified ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2ecc71' }}>
                  <Check size={16} /> Verified
                </span>
              ) : null}
            </div>

            {!phoneVerified && (
              <div className='formStack' style={{ marginTop: 8 }}>
                <input
                  className='plainInput'
                  type='tel'
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder='+234 701 234 5678'
                  disabled={otpSent}
                />

                {!otpSent ? (
                  <button
                    className='purpleBtn'
                    type='button'
                    disabled={busy === 'phone'}
                    onClick={sendOtp}
                  >
                    Send code
                  </button>
                ) : (
                  <>
                    <input
                      className='plainInput'
                      inputMode='numeric'
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      placeholder='6-digit code'
                      maxLength={6}
                    />
                    <button
                      className='purpleBtn'
                      type='button'
                      disabled={busy === 'verify'}
                      onClick={verifyOtp}
                    >
                      Verify code
                    </button>
                    <button
                      className='authLink'
                      type='button'
                      disabled={busy === 'phone' || otpCooldown > 0}
                      onClick={sendOtp}
                    >
                      {otpCooldown > 0 ? `Resend code (${otpCooldown}s)` : "Didn't get it? Resend code"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {emailVerified && phoneVerified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2ecc71' }}>
              <ShieldCheck size={16} /> Your account is fully verified.
            </div>
          ) : (
            <small>Both steps are required before you can continue into the app.</small>
          )}

          <button
            className='purpleBtn wide'
            type='button'
            disabled={!(emailVerified && phoneVerified)}
            onClick={onDone}
          >
            Continue
            <ArrowRight size={16} />
          </button>

          {signOut && (
            <button className='authLink' type='button' onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
