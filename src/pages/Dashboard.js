import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ stock: 0, deliveries: 0, hawb: 0 })
  const [recentStock, setRecentStock] = useState([])
  const [recentInvoices, setRecentInvoices] = useState([])
  const [recentAudit, setRecentAudit] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    const [
      { count: stockCount },
      { count: deliveryCount },
      { count: hawbCount },
      { data: stock },
      { data: invoices },
      { data: audit },
    ] = await Promise.all([
      supabase.from('stock').select('*', { count: 'exact', head: true }).in('status', ['in_stock', 'part_despatched']),
      supabase.from('stock').select('*', { count: 'exact', head: true }).not('delivery_date', 'is', null).eq('status', 'part_despatched'),
      supabase.from('hawb_numbers').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      supabase.from('stock').select('job_number, jade_reference, product, pallet_amount, status, billing').order('created_at', { ascending: false }).limit(5),
      supabase.from('invoices').select('invoice_number, hawb_number, total_amount, billing, status, invoice_date').order('created_at', { ascending: false }).limit(4),
      supabase.from('audit_log').select('action, reference, detail, created_at, profiles(display_name)').order('created_at', { ascending: false }).limit(6),
    ])
    setStats({ stock: stockCount || 0, deliveries: deliveryCount || 0, hawb: hawbCount || 0 })
    setRecentStock(stock || [])
    setRecentInvoices(invoices || [])
    setRecentAudit(audit || [])
    setLoading(false)
  }

  const statusTag = (s) => {
    const map = { in_stock: ['tag-green', 'IN STOCK'], part_despatched: ['tag-yellow', 'PART DESP.'], despatched: ['tag-blue', 'DESPATCHED'], invoiced: ['tag-red', 'INVOICED'] }
    const [cls, label] = map[s] || ['tag-orange', s]
    return <span className={`tag ${cls}`}>{label}</span>
  }

  const billingTag = (b) => <span className={`tag ${b === 'china' ? 'tag-red' : 'tag-blue'}`}>{b?.toUpperCase()}</span>

  const invStatusTag = (s) => {
    const map = { draft: ['tag-yellow', 'DRAFT'], sent: ['tag-blue', 'SENT'], approved: ['tag-green', 'APPROVED'] }
    const [cls, label] = map[s] || ['tag-orange', s]
    return <span className={`tag ${cls}`}>{label}</span>
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">{greeting}, {profile?.display_name?.split(' ')[0]}</div>
          <div className="page-subtitle">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}</div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Active Stock Lines', value: stats.stock, sub: 'In stock & part despatched', color: 'var(--accent)', icon: '📦' },
          { label: 'Pending Deliveries', value: stats.deliveries, sub: 'Awaiting despatch', color: 'var(--blue)', icon: '🚚' },
          { label: 'HAWB Pool', value: stats.hawb, sub: 'Numbers available', color: 'var(--green)', icon: '🔢' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, padding: 20, position: 'relative', overflow: 'hidden', borderTop: `2px solid ${k.color}` }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 10 }}>{k.label}</div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{loading ? '…' : k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{k.sub}</div>
            <div style={{ position: 'absolute', right: 16, top: 16, fontSize: 28, opacity: 0.12 }}>{k.icon}</div>
          </div>
        ))}
      </div>

      {/* BOTTOM GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent stock */}
        <div>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 600 }}>Recent Stock</div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/stock')}>View All</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Job No.</th><th>JADE Ref</th><th>Product</th><th>Status</th></tr></thead>
              <tbody>
                {recentStock.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>No stock records yet</td></tr>}
                {recentStock.map(s => (
                  <tr key={s.job_number} className="clickable" onClick={() => navigate('/stock')}>
                    <td className="bold mono-sm" style={{ color: 'var(--accent)' }}>{s.job_number}</td>
                    <td className="bold mono-sm">{s.jade_reference}</td>
                    <td>{s.product}</td>
                    <td>{statusTag(s.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent invoices */}
        <div>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 600 }}>Recent Invoices</div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/invoices')}>View All</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Amount</th><th>Billing</th><th>Status</th></tr></thead>
              <tbody>
                {recentInvoices.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>No invoices yet</td></tr>}
                {recentInvoices.map(inv => (
                  <tr key={inv.invoice_number} className="clickable" onClick={() => navigate('/invoices')}>
                    <td className="bold mono-sm">{inv.invoice_number}</td>
                    <td className="bold">£{(inv.override_total || inv.total_amount || 0).toFixed(2)}</td>
                    <td>{billingTag(inv.billing)}</td>
                    <td>{invStatusTag(inv.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Activity feed */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Activity Feed</div>
            <div className="card" style={{ padding: '12px 16px' }}>
              {recentAudit.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No activity yet</div>}
              {recentAudit.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 8, marginBottom: 8, borderBottom: i < recentAudit.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{a.detail || a.action} {a.reference && <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>{a.reference}</span>}</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                      {new Date(a.created_at).toLocaleTimeString('en-GB')} · {a.profiles?.display_name || 'System'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
