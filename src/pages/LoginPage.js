import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { logAction, ACTIONS } from '../lib/audit'

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      toast.error('Invalid email or password')
    } else {
      toast.success('Welcome back!')
      navigate('/')
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    const { error } = await resetPassword(forgotEmail)
    if (error) toast.error(error.message)
    else { toast.success('Password reset email sent!'); setShowForgot(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-0)', position: 'relative', zIndex: 1 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(48,144,232,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: 420, background: 'var(--bg-2)', border: '1px solid var(--border-bright)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 60px rgba(0,0,0,0.8)', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ background: 'var(--dhl-red)', padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, background: 'var(--dhl-yellow)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 20, color: '#000' }}>KW</div>
          <div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: '#fff' }}>Kaifa WMS</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>Warehouse Management System</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 32 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-2)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 24, borderLeft: '2px solid var(--accent)', paddingLeft: 10 }}>
            SECURE PORTAL
          </div>

          {!showForgot ? (
            <form onSubmit={handleLogin}>
              <div className="field-group">
                <label className="field-label">Email Address</label>
                <input className="field-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" autoFocus />
              </div>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input className="field-input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', background: 'var(--dhl-red)', color: '#fff', border: 'none', borderRadius: 3, padding: 12, fontFamily: 'Rajdhani', fontSize: 17, fontWeight: 600, letterSpacing: 1, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'SIGNING IN…' : 'SIGN IN'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setShowForgot(true)}>Forgot username or password?</span>
              </div>
            </form>
          ) : (
            <form onSubmit={handleForgot}>
              <div className="alert alert-info">Enter the email address linked to your account and we'll send a password reset link.</div>
              <div className="field-group">
                <label className="field-label">Email Address</label>
                <input className="field-input" type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="your@email.com" autoFocus />
              </div>
              <button type="submit" style={{ width: '100%', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 3, padding: 12, fontFamily: 'Rajdhani', fontSize: 17, fontWeight: 600, letterSpacing: 1, cursor: 'pointer' }}>
                SEND RESET EMAIL
              </button>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--blue)', cursor: 'pointer' }} onClick={() => setShowForgot(false)}>← Back to sign in</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
