import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'
import { logAction, ACTIONS } from '../lib/audit'

const NAV = [
  { label: 'Dashboard',       path: '/',                  icon: '⊞', section: 'MAIN' },
  { label: 'Stock / Inventory', path: '/stock',           icon: '📦', section: null },
  { label: 'Invoicing',       path: '/invoices',          icon: '📄', section: null },
  { label: 'Deliveries',      path: '/deliveries',        icon: '🚚', section: null },
  { label: 'Search',          path: '/search',            icon: '🔍', section: null },
  { label: 'Kaifa Stock List',path: '/kaifa-stock-list',  icon: '📋', section: 'REPORTS' },
  { label: 'DHL China Report',path: '/china-report',      icon: '📊', section: null },
  { label: 'Audit Log',       path: '/audit',             icon: '🗒', section: null },
  { label: 'Users',           path: '/users',             icon: '👥', section: 'ADMIN', adminOnly: true },
  { label: 'Settings',        path: '/settings',          icon: '⚙️', section: null },
  { label: 'HAWB Numbers',    path: '/hawb',              icon: '#',  section: null, adminOnly: true },
]

export default function Layout() {
  const { profile, isAdmin, signOut, user } = useAuth()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)

  async function handleSignOut() {
    await logAction(user?.id, ACTIONS.LOGOUT)
    await signOut()
    navigate('/login')
  }

  const initials = profile?.display_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      {/* SIDEBAR */}
      <aside style={{
        width: 'var(--sidebar-width)', minHeight: '100vh', background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ background: 'var(--dhl-red)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--dhl-yellow)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 15, color: '#000', flexShrink: 0 }}>KW</div>
            <div>
              <div style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 18, color: '#fff' }}>KAIFA WMS</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Warehouse System</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {NAV.map((item, i) => {
            if (item.adminOnly && !isAdmin) return null
            return (
              <div key={item.path}>
                {item.section && (
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-3)', padding: '16px 20px 6px' }}>
                    {item.section}
                  </div>
                )}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 20px', fontSize: 14, textDecoration: 'none',
                    color: isActive ? 'var(--text-0)' : 'var(--text-1)',
                    background: isActive ? 'var(--bg-3)' : 'transparent',
                    borderLeft: `2px solid ${isActive ? 'var(--dhl-yellow)' : 'transparent'}`,
                    transition: 'all 0.15s',
                  })}
                >
                  <span style={{ fontSize: 14, opacity: 0.8 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              </div>
            )
          })}
        </nav>

        {/* Bottom user info */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-4)', border: '1px solid var(--border-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.display_name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>{profile?.role}</div>
          </div>
          <button onClick={handleSignOut} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }} title="Sign out">↩</button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ marginLeft: 'var(--sidebar-width)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Top bar */}
        <header style={{ height: 52, background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, position: 'sticky', top: 0, zIndex: 40 }}>
          <div style={{ flex: 1 }} />
          <div
            onClick={() => navigate('/search')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 3, padding: '6px 12px', width: 280, cursor: 'pointer' }}
          >
            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>🔍</span>
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Search JADE, Shipment, HAWB…</span>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setNotifOpen(o => !o)} style={{ width: 32, height: 32, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', fontSize: 15, color: 'var(--text-1)' }}>🔔</button>
            {notifOpen && (
              <div style={{ position: 'absolute', top: 36, right: 0, width: 300, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: 1, color: 'var(--text-2)', textTransform: 'uppercase' }}>Notifications</div>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)' }}>System ready</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Kaifa WMS is connected to Supabase</div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: 24 }}>
          <Outlet />
        </main>

        {/* Status strip */}
        <footer style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--border)', padding: '5px 24px', display: 'flex', gap: 24, fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)' }}>
          <span>● System Online</span>
          <span>● Supabase Connected</span>
          <span style={{ marginLeft: 'auto' }}>{new Date().toLocaleTimeString('en-GB')}</span>
        </footer>
      </div>
    </div>
  )
}
