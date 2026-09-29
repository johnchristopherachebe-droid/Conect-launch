import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Mail,
  Phone,
  User
} from 'lucide-react';

export default function SignupOnboarding({
  user,
  onboarding,
  setOnboarding,
  completeSignup,
  signOut
}: any) {
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

          <span className='step'>Create account</span>
        </div>

        <h1>Create Account</h1>
        <p>Join cönëct today.</p>

        <div className='formStack'>

          {/* FULL NAME */}
          <label>
            <span>
              <User size={14} />
              Full name
            </span>

            <input
              type='text'
              value={onboarding.name || ''}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  name: e.target.value
                }))
              }
              placeholder='Full name'
              autoComplete='name'
            />
          </label>

          {/* PHONE */}
          <label>
            <span>
              <Phone size={14} />
              Phone number
            </span>

            <input
              type='tel'
              value={onboarding.phone || ''}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  phone: e.target.value
                }))
              }
              placeholder='+234 701 234 5678'
              inputMode='tel'
              autoComplete='tel'
            />
          </label>

          {/* EMAIL */}
          <label>
            <span>
              <Mail size={14} />
              Email address
            </span>

            <input
              type='email'
              value={onboarding.email || ''}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  email: e.target.value
                }))
              }
              placeholder='Email address'
              autoComplete='email'
            />
          </label>

          {/* USERNAME */}
          <label>
            <span>
              <User size={14} />
              Username
            </span>

            <input
              type='text'
              value={onboarding.username || ''}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  username: e.target.value
                }))
              }
              placeholder='Choose a username'
              autoComplete='username'
            />
          </label>

          {/* PASSWORD */}
          <label>
            <span>
              <Lock size={14} />
              Password
            </span>

            <input
              type='password'
              value={onboarding.password || ''}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  password: e.target.value
                }))
              }
              placeholder='Create a password'
              autoComplete='new-password'
            />
          </label>

          {/* ACCOUNT TYPE */}
          <label>
            <span>Account type</span>

            <select
              value={onboarding.role || 'customer'}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  role: e.target.value
                }))
              }
            >
              <option value='customer'>Customer</option>
              <option value='vendor'>Vendor</option>
              <option value='rider'>Rider</option>
            </select>
          </label>

          {/* HOME ADDRESS */}
          {onboarding.role === 'customer' && (
            <label>
              <span>
                <Phone size={14} />
                Home address
              </span>

              <input
                type='text'
                value={onboarding.homeAddress || ''}
                onChange={e =>
                  setOnboarding((x: any) => ({
                    ...x,
                    homeAddress: e.target.value
                  }))
                }
                placeholder='Your home address'
                autoComplete='street-address'
              />
            </label>
          )}

          {/* TERMS */}
          <label
            className='termsLine'
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer'
            }}
          >
            <input
              type='checkbox'
              checked={Boolean(onboarding.termsAccepted)}
              onChange={e =>
                setOnboarding((x: any) => ({
                  ...x,
                  termsAccepted: e.target.checked
                }))
              }
              style={{
                width: 16,
                height: 16
              }}
            />

            <span>
              I agree to the Terms & Conditions and Privacy Policy
            </span>
          </label>

          {/* CREATE ACCOUNT */}
          <button
            className='purpleBtn wide'
            onClick={completeSignup}
            type='button'
          >
            Create Account
            <ArrowRight size={16} />
          </button>

          {/* BACK */}
          <button
            className='authLink'
            onClick={signOut}
            type='button'
          >
            <ArrowLeft size={14} />
            Back to sign in
          </button>

        </div>
      </div>
    </div>
  );
}
