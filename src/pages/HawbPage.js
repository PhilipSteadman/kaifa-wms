import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function HawbPage() {
  const { user, profile } = useAuth()
  const [hawbs, setHawbs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [stats, setStats] = useState({ available: 0, used: 0, retired: 0 })

  const isAdmin = profile?.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('hawb_numbers').select('*, invoices(invoice_number)').order('created_at', { ascending: false })
    if (filterStatus !== 'all') q = q.eq('status', filterStatus)

    const [{ data }, { count: avail }, { count: used }, { count: retired }] = await Promise.all([
      q,
      supabase.from('hawb_numbers').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      supabase.from('hawb_numbers').select('*', { count: 'exact', head: true }).eq('status', 'used'),
      supabase.from('hawb_numbers').select('*', { count: 'exact', head: true }).eq('status', 'retired'),
    ])
    setHawbs(data || [])
    setStats({ available: avail || 0, used: used || 0, retired: retired || 0 })
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const filtered = hawbs.filter(h => {
    if (!search) return true
    return h.hawb_number?.toLowerCase().includes(search.toLowerCase()) ||
           h.invoices?.invoice_number?.toLowerCase().includes(search.toLowerCase())
  })

  async function handleImport() {
    if (!bulkText.trim()) { toast.error('Paste HAWB numbers first'); return }
    const numbers = bulkText.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
    if (numbers.length === 0) { toast.error('No valid HAWB numbers found'); return }
    setImporting(true)
    const rows = numbers.map(hawb_number => ({ hawb_number, status: 'available' }))
    const { data, error } = await supabase.from('hawb_numbers').upsert(rows, { onConflict: 'hawb_number', ignoreDuplicates: true }).select()
    if (error) { toast.error(error.message); setImporting(false); return }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, 'hawb_numbers', `Imported ${numbers.length} HAWB numbers`)
    toast.success(`Imported ${data?.length || numbers.length} HAWB numbers (duplicates skipped)`)
    setBulkText('')
    setImporting(false)
    load()
  }

  async function handleRetire(hawb) {
    setDeleting(hawb.id)
    const { error } = await supabase.from('hawb_numbers').update({ status: 'retired' }).eq('id', hawb.id)
    if (error) { toast.error(error.message); setDeleting(null); return }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, hawb.hawb_number, 'HAWB number retired')
    toast.success(`${hawb.hawb_number} retired`)
    setDeleting(null)
    load()
  }

  async function handleRestore(hawb) {
    const { error } = await supabase.from('hawb_numbers').update({ status: 'available' }).eq('id', hawb.id)
    if (error) { toast.error(error.message); return }
    toast.success(`${hawb.hawb_number} restored to available`)
    load()
  }

  if (!isAdmin) {
    return (
      <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontFamily: 'Rajdhani', fontSize: 22, color: 'var(--text-0)' }}>Admin Access Required</div>
        <div style={{ fontSize: 14, color: 'var(--text-2)' }}>Only administrators can manage HAWB numbers.</div>
      </div>
    )
  }

  const detectedCount = bulkText.trim() ? bulkText.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean).length : 0

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">HAWB Numbers</div>
          <div className="page-subtitle">HOUSE AIR WAYBILL NUMBER POOL</div>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { l: 'Available', v: stats.available, c: 'var(--green)' },
          { l: 'Used',      v: stats.used,      c: 'var(--text-2)' },
          { l: 'Retired',   v: stats.retired,   c: 'var(--text-3)' },
          { l: 'Total',     v: stats.available + stats.used + stats.retired, c: 'var(--text-0)' },
        ].map(k => (
          <div key={k.l} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '14px 18px' }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 28, fontWeight: 700, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {stats.available < 5 && (
        <div className="alert alert-warn" style={{ marginBottom: 20 }}>
          ⚠ Only {stats.available} HAWB number{stats.available !== 1 ? 's' : ''} remaining in the pool. Import more below before creating new invoices.
        </div>
      )}

      {/* BULK IMPORT */}
      <div style={{ marginBottom: 28, padding: 20, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4 }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 12 }}>BULK IMPORT</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
          Paste HAWB numbers below — one per line, comma-separated, or space-separated. Duplicates are automatically skipped.
        </div>
        <textarea
          className="field-input"
          rows={6}
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
          placeholder={'HAWB001\nHAWB002\nHAWB003\n…'}
          style={{ fontFamily: 'JetBrains Mono', fontSize: 13, marginBottom: 12, letterSpacing: 0.5 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: detectedCount > 0 ? 'var(--accent)' : 'var(--text-3)', fontFamily: 'JetBrains Mono' }}>
            {detectedCount > 0 ? `${detectedCount} number${detectedCount !== 1 ? 's' : ''} detected` : 'Paste numbers above'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {bulkText && <button className="btn btn-secondary" onClick={() => setBulkText('')}>Clear</button>}
            <button className="btn btn-danger" disabled={importing || detectedCount === 0} onClick={handleImport}>
              {importing ? 'Importing…' : `Import ${detectedCount > 0 ? detectedCount : ''} HAWB Numbers`}
            </button>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar">
        <input
          className="field-input"
          style={{ width: 220, padding: '7px 12px', fontSize: 13 }}
          placeholder="Search HAWB number or invoice…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="available">Available</option>
          <option value="used">Used</option>
          <option value="retired">Retired</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'JetBrains Mono' }}>{filtered.length} records</span>
      </div>

      {/* TABLE */}
      <div className="table-wrap">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontFamily: 'JetBrains Mono', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏷️</div>
            <div style={{ fontFamily: 'Rajdhani', fontSize: 18, color: 'var(--text-0)', marginBottom: 6 }}>No HAWB numbers found</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Import HAWB numbers using the panel above</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>HAWB Number</th>
                <th>Status</th>
                <th>Assigned to Invoice</th>
                <th>Used At</th>
                <th>Imported</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr key={h.id} style={h.status === 'retired' ? { opacity: 0.45 } : {}}>
                  <td>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: h.status === 'available' ? 'var(--accent)' : 'var(--text-2)', fontWeight: 600, letterSpacing: 1 }}>
                      {h.hawb_number}
                    </span>
                  </td>
                  <td>
                    <span className={`tag ${h.status === 'available' ? 'tag-green' : h.status === 'used' ? 'tag-orange' : 'tag-yellow'}`}>
                      {h.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="mono-sm">{h.invoices?.invoice_number || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td className="mono-sm">{h.used_at ? format(new Date(h.used_at), 'dd/MM/yy HH:mm') : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td className="mono-sm">{h.created_at ? format(new Date(h.created_at), 'dd/MM/yy') : '—'}</td>
                  <td>
                    {h.status === 'available' && (
                      <button className="btn btn-sm btn-ghost" disabled={deleting === h.id} onClick={() => handleRetire(h)}>
                        {deleting === h.id ? '…' : 'Retire'}
                      </button>
                    )}
                    {h.status === 'retired' && (
                      <button className="btn btn-sm btn-accent" onClick={() => handleRestore(h)}>Restore</button>
                    )}
                    {h.status === 'used' && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
