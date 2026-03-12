import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const ACTION_COLORS = {
  STOCK_ADDED:      'var(--green)',
  STOCK_UPDATED:    'var(--blue)',
  STOCK_SPLIT:      'var(--accent)',
  INVOICE_CREATED:  'var(--dhl-yellow)',
  INVOICE_SENT:     'var(--dhl-yellow)',
  PRICE_OVERRIDE:   'var(--red)',
  CHINA_APPROVED:   'var(--green)',
  USER_CREATED:     'var(--blue)',
  USER_UPDATED:     'var(--text-2)',
  SETTINGS_CHANGED: 'var(--text-2)',
  LOGIN:            'var(--text-3)',
}

const ActionBadge = ({ action }) => {
  const color = ACTION_COLORS[action] || 'var(--text-2)'
  const short = action?.replace(/_/g,' ') || '—'
  return (
    <span style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:0.5,color,background:`${color}18`,border:`1px solid ${color}33`,padding:'2px 7px',borderRadius:3,whiteSpace:'nowrap'}}>
      {short}
    </span>
  )
}

export default function AuditLogPage() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('all')
  const [filterUser, setFilterUser] = useState('all')
  const [filterDate, setFilterDate] = useState('')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const isAdmin = profile?.role === 'admin'

  const loadLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_log')
      .select('*, profiles(display_name,email,role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filterAction !== 'all') q = q.eq('action', filterAction)
    if (filterUser !== 'all') q = q.eq('user_id', filterUser)
    if (filterDate) {
      const start = `${filterDate}T00:00:00`
      const end   = `${filterDate}T23:59:59`
      q = q.gte('created_at', start).lte('created_at', end)
    }

    const { data, error } = await q
    if (error) toast.error('Failed to load audit log')
    else setLogs(data || [])
    setLoading(false)
  }, [filterAction, filterUser, filterDate, page])

  useEffect(() => { loadLogs() }, [loadLogs])

  useEffect(() => {
    supabase.from('profiles').select('id,display_name,email').order('display_name').then(({ data }) => setUsers(data || []))
  }, [])

  const filtered = logs.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      l.reference?.toLowerCase().includes(q) ||
      l.detail?.toLowerCase().includes(q) ||
      l.action?.toLowerCase().includes(q) ||
      l.profiles?.display_name?.toLowerCase().includes(q) ||
      l.profiles?.email?.toLowerCase().includes(q)
    )
  })

  if (!isAdmin) {
    return (
      <div className="fade-in" style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:16}}>
        <div style={{fontSize:48}}>🔒</div>
        <div style={{fontFamily:'Rajdhani',fontSize:22,color:'var(--text-0)'}}>Admin Access Required</div>
        <div style={{fontSize:14,color:'var(--text-2)'}}>Only administrators can view the audit log.</div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Audit Log</div>
          <div className="page-subtitle">IMMUTABLE RECORD OF ALL SYSTEM ACTIVITY</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text-3)',fontFamily:'JetBrains Mono'}}>Read-only · Cannot be modified</span>
          <span style={{fontSize:16}}>🔒</span>
        </div>
      </div>

      <div className="toolbar" style={{flexWrap:'wrap',gap:8}}>
        <input
          className="field-input"
          style={{width:220,padding:'7px 12px',fontSize:13}}
          placeholder="Search reference, detail, user…"
          value={search}
          onChange={e=>setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterAction} onChange={e=>{setFilterAction(e.target.value);setPage(0)}}>
          <option value="all">All Actions</option>
          <option value="STOCK_ADDED">Stock Added</option>
          <option value="STOCK_UPDATED">Stock Updated</option>
          <option value="STOCK_SPLIT">Stock Split</option>
          <option value="INVOICE_CREATED">Invoice Created</option>
          <option value="INVOICE_SENT">Invoice Sent</option>
          <option value="PRICE_OVERRIDE">Price Override</option>
          <option value="CHINA_APPROVED">China Approved</option>
          <option value="USER_CREATED">User Created</option>
          <option value="USER_UPDATED">User Updated</option>
          <option value="SETTINGS_CHANGED">Settings Changed</option>
          <option value="LOGIN">Login</option>
        </select>
        <select className="filter-select" value={filterUser} onChange={e=>{setFilterUser(e.target.value);setPage(0)}}>
          <option value="all">All Users</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.display_name||u.email}</option>)}
        </select>
        <input
          className="field-input"
          type="date"
          style={{padding:'7px 12px',fontSize:13,width:160}}
          value={filterDate}
          onChange={e=>{setFilterDate(e.target.value);setPage(0)}}
        />
        {filterDate && <button className="btn btn-sm btn-ghost" onClick={()=>setFilterDate('')}>Clear date</button>}
        <div style={{flex:1}}/>
        <span style={{fontSize:12,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{filtered.length} records</span>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:12}}>📋</div>
            <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No audit entries found</div>
            <div style={{fontSize:13,color:'var(--text-2)'}}>Activity will be recorded here as the system is used</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Reference</th>
                <th>Detail</th>
                <th>User</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id}>
                  <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--text-2)',whiteSpace:'nowrap'}}>
                    {l.created_at ? format(new Date(l.created_at), 'dd/MM/yy HH:mm:ss') : '—'}
                  </td>
                  <td><ActionBadge action={l.action}/></td>
                  <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',fontWeight:600}}>{l.reference||'—'}</td>
                  <td style={{fontSize:12,color:'var(--text-1)',maxWidth:320,whiteSpace:'normal',lineHeight:1.4}}>{l.detail||'—'}</td>
                  <td>
                    <div style={{fontSize:13,fontWeight:500,color:'var(--text-0)'}}>{l.profiles?.display_name||'—'}</div>
                    <div style={{fontSize:11,color:'var(--text-3)',fontFamily:'JetBrains Mono'}}>{l.profiles?.email||''}</div>
                  </td>
                  <td>
                    {l.profiles?.role && (
                      <span className={`tag ${l.profiles.role==='admin'?'tag-red':l.profiles.role==='limited'?'tag-green':'tag-blue'}`} style={{fontSize:10}}>
                        {l.profiles.role.toUpperCase()}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINATION */}
      {!loading && (
        <div style={{display:'flex',justifyContent:'center',gap:10,marginTop:16,alignItems:'center'}}>
          <button className="btn btn-sm btn-secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Previous</button>
          <span style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--text-2)'}}>Page {page+1}</span>
          <button className="btn btn-sm btn-secondary" disabled={logs.length<PAGE_SIZE} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>
      )}
    </div>
  )
}
