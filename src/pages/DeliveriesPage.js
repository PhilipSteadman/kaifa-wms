import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import toast from 'react-hot-toast'
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns'
import PodUploader from '../components/PodUploader'

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  in_stock:        { cls: 'tag-green',  label: 'IN STOCK' },
  part_despatched: { cls: 'tag-yellow', label: 'SCHEDULED' },
  despatched:      { cls: 'tag-blue',   label: 'DESPATCHED' },
  invoiced:        { cls: 'tag-red',    label: 'INVOICED' },
}
const Tag = ({ status, billing }) => {
  if (billing) return <span className={`tag ${billing==='china'?'tag-red':'tag-blue'}`}>{billing.toUpperCase()}</span>
  const { cls, label } = STATUS_MAP[status] || { cls:'tag-orange', label:status }
  return <span className={`tag ${cls}`}>{label}</span>
}
const DateBadge = ({ dateStr }) => {
  if (!dateStr) return <span style={{color:'var(--text-3)'}}>—</span>
  const d = parseISO(dateStr)
  const color = isPast(d) && !isToday(d) ? 'var(--red)' : isToday(d) ? 'var(--accent)' : isTomorrow(d) ? 'var(--dhl-yellow)' : 'var(--text-0)'
  const label = isToday(d) ? 'TODAY' : isTomorrow(d) ? 'TOMORROW' : format(d,'dd/MM/yy')
  return <span style={{fontFamily:'JetBrains Mono',fontSize:11,color,fontWeight:isToday(d)||isTomorrow(d)?700:400}}>{label}</span>
}

// ─── SCHEDULE DELIVERY MODAL ──────────────────────────────────────────────────
function ScheduleModal({ onClose, onSaved, editRecord = null }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [stockOptions, setStockOptions] = useState([])
  const [customers, setCustomers] = useState([])
  const [addresses, setAddresses] = useState([])
  const [filteredAddresses, setFilteredAddresses] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(editRecord ? {
    stock_id: editRecord.id,
    delivery_date: editRecord.delivery_date || format(new Date(),'yyyy-MM-dd'),
    customer_id: editRecord.customer_id || '',
    delivery_address_id: editRecord.delivery_address_id || '',
    branch_id: editRecord.branch_id || '',
    booking_reference: editRecord.booking_reference || '',
    hawb_number: editRecord.hawb_number || '',
    delivery_instructions: editRecord.delivery_instructions || '',
  } : {
    stock_id: '', delivery_date: format(new Date(),'yyyy-MM-dd'),
    customer_id: '', delivery_address_id: '', branch_id: '',
    booking_reference: '', hawb_number: '', delivery_instructions: '',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(() => {
    Promise.all([
      supabase.from('stock').select('id,job_number,jade_reference,product,pallet_amount,carton_amount,billing').in('status',['in_stock','part_despatched']).order('created_at',{ascending:false}),
      supabase.from('customers').select('*').order('name'),
      supabase.from('delivery_addresses').select('*, customers(name)').order('label'),
      supabase.from('branches').select('*').order('name'),
    ]).then(([s,c,a,b]) => {
      setStockOptions(s.data||[])
      setCustomers(c.data||[])
      setAddresses(a.data||[])
      setFilteredAddresses(a.data||[])
      setBranches(b.data||[])
    })
  }, [])

  useEffect(() => {
    if (form.customer_id) {
      setFilteredAddresses(addresses.filter(a => !a.customer_id || a.customer_id === form.customer_id))
    } else {
      setFilteredAddresses(addresses)
    }
    set('delivery_address_id', '')
  }, [form.customer_id])

  async function handleSave() {
    if (!form.stock_id || !form.delivery_date) { toast.error('Stock line and delivery date are required'); return }
    setSaving(true)
    const { error } = await supabase.from('stock').update({
      delivery_date: form.delivery_date,
      customer_id: form.customer_id || null,
      delivery_address_id: form.delivery_address_id || null,
      branch_id: form.branch_id || null,
      booking_reference: form.booking_reference || null,
      hawb_number: form.hawb_number || null,
      delivery_instructions: form.delivery_instructions || null,
      status: 'part_despatched',
    }).eq('id', form.stock_id)

    if (error) { toast.error(error.message); setSaving(false); return }
    const stock = stockOptions.find(s=>s.id===form.stock_id)
    await logAction(user?.id, ACTIONS.STOCK_UPDATED, stock?.jade_reference, `Delivery scheduled for ${form.delivery_date}`)
    setSaving(false)
    toast.success('Delivery scheduled!')
    onSaved(); onClose()
  }

  async function markDespatched(stockId) {
    setSaving(true)
    const { error } = await supabase.from('stock').update({ status:'despatched' }).eq('id', stockId)
    if (error) { toast.error(error.message); setSaving(false); return }
    const stock = stockOptions.find(s=>s.id===stockId)
    await logAction(user?.id, ACTIONS.STOCK_UPDATED, stock?.jade_reference, 'Marked as despatched')
    setSaving(false)
    toast.success('Marked as despatched')
    onSaved(); onClose()
  }

  const selectedStock = stockOptions.find(s=>s.id===form.stock_id)

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div className="modal-title">{editRecord ? 'Edit Delivery' : 'Schedule Delivery'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-section">STOCK LINE</div>
          {editRecord ? (
            <div style={{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'10px 14px',marginBottom:16,fontSize:13}}>
              <span style={{color:'var(--accent)',fontFamily:'JetBrains Mono',marginRight:8}}>{editRecord.job_number}</span>
              <span style={{fontWeight:500}}>{editRecord.jade_reference}</span>
              <span style={{color:'var(--text-2)',margin:'0 8px'}}>·</span>
              <span>{editRecord.product}</span>
              <span style={{color:'var(--text-2)',margin:'0 8px'}}>·</span>
              <span>{editRecord.pallet_amount}P / {editRecord.carton_amount}C</span>
            </div>
          ) : (
            <div className="field-group">
              <label className="field-label">Select Stock Line *</label>
              <select className="field-select" value={form.stock_id} onChange={e=>set('stock_id',e.target.value)}>
                <option value="">Choose stock line…</option>
                {stockOptions.map(s=>(
                  <option key={s.id} value={s.id}>{s.job_number} — {s.jade_reference} · {s.product} · {s.pallet_amount}P/{s.carton_amount}C · {s.billing.toUpperCase()}</option>
                ))}
              </select>
            </div>
          )}

          {selectedStock && (
            <div style={{display:'flex',gap:16,marginBottom:16,padding:'8px 14px',background:'rgba(48,144,232,0.05)',border:'1px solid rgba(48,144,232,0.15)',borderRadius:3}}>
              <div><span style={{fontSize:10,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase'}}>Pallets</span><div style={{fontFamily:'Rajdhani',fontSize:20,fontWeight:700}}>{selectedStock.pallet_amount}</div></div>
              <div><span style={{fontSize:10,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase'}}>Cartons</span><div style={{fontFamily:'Rajdhani',fontSize:20,fontWeight:700}}>{selectedStock.carton_amount}</div></div>
              <div><span style={{fontSize:10,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase'}}>Billing</span><div style={{marginTop:2}}><Tag billing={selectedStock.billing}/></div></div>
            </div>
          )}

          <div className="form-section">DELIVERY DETAILS</div>
          <div className="form-grid">
            <div className="field-group">
              <label className="field-label">Delivery Date *</label>
              <input className="field-input" type="date" value={form.delivery_date} onChange={e=>set('delivery_date',e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Booking Reference</label>
              <input className="field-input" value={form.booking_reference} onChange={e=>set('booking_reference',e.target.value)} placeholder="e.g. BK-44821" />
            </div>
            <div className="field-group">
              <label className="field-label">Customer</label>
              <select className="field-select" value={form.customer_id} onChange={e=>set('customer_id',e.target.value)}>
                <option value="">Select customer…</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Delivery Address</label>
              <select className="field-select" value={form.delivery_address_id} onChange={e=>set('delivery_address_id',e.target.value)}>
                <option value="">Select address…</option>
                {filteredAddresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.address_line1}, {a.city} (cap: £{a.max_delivery_cap})</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Branch Making Delivery</label>
              <select className="field-select" value={form.branch_id} onChange={e=>set('branch_id',e.target.value)}>
                <option value="">Select branch…</option>
                {branches.map(b=><option key={b.id} value={b.id}>{b.name}{b.location?` — ${b.location}`:''}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">HAWB Number</label>
              <input className="field-input" value={form.hawb_number} onChange={e=>set('hawb_number',e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Delivery Instructions</label>
            <textarea className="field-input" rows={2} value={form.delivery_instructions} onChange={e=>set('delivery_instructions',e.target.value)} placeholder="Any specific instructions for this delivery…" />
          </div>
          {editRecord && (
            <div style={{borderTop:'1px solid var(--border)',paddingTop:16,marginTop:4}}>
              <PodUploader stockId={editRecord.id} stockRef={editRecord.jade_reference} isReadOnly={false}/>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {editRecord && (
            <button className="btn btn-accent" disabled={saving} onClick={()=>markDespatched(editRecord.id)}>
              {saving ? 'Saving…' : '✓ Mark as Despatched'}
            </button>
          )}
          <button className="btn btn-danger" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : editRecord ? 'Save Changes' : 'Schedule Delivery'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN DELIVERIES PAGE ─────────────────────────────────────────────────────
export default function DeliveriesPage() {
  const { isReadOnly } = useAuth()
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterBranch, setFilterBranch] = useState('all')
  const [filterBilling, setFilterBilling] = useState('all')
  const [filterDate, setFilterDate] = useState('all')
  const [filterStatus, setFilterStatus] = useState('scheduled')
  const [branches, setBranches] = useState([])
  const [showSchedule, setShowSchedule] = useState(false)
  const [editRecord, setEditRecord] = useState(null)

  const loadDeliveries = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('stock')
      .select('*, customers(name), delivery_addresses(label,address_line1,city,max_delivery_cap), branches(name,location)')
      .not('delivery_date','is',null)
      .order('delivery_date',{ascending:true})

    if (filterBilling!=='all') q=q.eq('billing',filterBilling)
    if (filterStatus==='scheduled') q=q.in('status',['part_despatched','in_stock'])
    if (filterStatus==='despatched') q=q.eq('status','despatched')

    const [{data}, {data:branchData}] = await Promise.all([
      q,
      supabase.from('branches').select('*').order('name'),
    ])
    let results = data||[]
    if (filterBranch!=='all') results=results.filter(d=>d.branch_id===filterBranch)
    if (filterDate==='today') results=results.filter(d=>d.delivery_date&&isToday(parseISO(d.delivery_date)))
    if (filterDate==='tomorrow') results=results.filter(d=>d.delivery_date&&isTomorrow(parseISO(d.delivery_date)))
    if (filterDate==='this_week') {
      const now=new Date(); const weekEnd=new Date(now); weekEnd.setDate(now.getDate()+7)
      results=results.filter(d=>{const dd=parseISO(d.delivery_date); return dd>=now&&dd<=weekEnd})
    }
    setDeliveries(results)
    setBranches(branchData||[])
    setLoading(false)
  }, [filterBranch,filterBilling,filterDate,filterStatus])

  useEffect(()=>{loadDeliveries()},[loadDeliveries])

  const todayCount = deliveries.filter(d=>d.delivery_date&&isToday(parseISO(d.delivery_date))).length
  const tomorrowCount = deliveries.filter(d=>d.delivery_date&&isTomorrow(parseISO(d.delivery_date))).length
  const overdueCount = deliveries.filter(d=>d.delivery_date&&isPast(parseISO(d.delivery_date))&&!isToday(parseISO(d.delivery_date))&&d.status!=='despatched').length

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Deliveries</div>
          <div className="page-subtitle">{deliveries.length} SCHEDULED · {todayCount} TODAY · {tomorrowCount} TOMORROW{overdueCount>0?` · ${overdueCount} OVERDUE`:''}</div>
        </div>
        {!isReadOnly && <button className="btn btn-danger" onClick={()=>setShowSchedule(true)}>+ Schedule Delivery</button>}
      </div>

      {/* SUMMARY CARDS */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:14,marginBottom:20}}>
        {[
          {label:'Today',    val:todayCount,    color:'var(--accent)',   onClick:()=>setFilterDate('today')},
          {label:'Tomorrow', val:tomorrowCount, color:'var(--dhl-yellow)', onClick:()=>setFilterDate('tomorrow')},
          {label:'This Week',val:deliveries.filter(d=>{if(!d.delivery_date)return false;const now=new Date();const weekEnd=new Date(now);weekEnd.setDate(now.getDate()+7);const dd=parseISO(d.delivery_date);return dd>=now&&dd<=weekEnd}).length, color:'var(--blue)', onClick:()=>setFilterDate('this_week')},
          {label:'Overdue',  val:overdueCount,  color:overdueCount>0?'var(--red)':'var(--text-3)', onClick:()=>{}},
        ].map(k=>(
          <div key={k.label} onClick={k.onClick} style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:4,padding:'14px 18px',cursor:'pointer',transition:'border-color 0.15s'}} onMouseOver={e=>e.currentTarget.style.borderColor='var(--border-bright)'} onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{k.label}</div>
            <div style={{fontFamily:'Rajdhani',fontSize:28,fontWeight:700,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      {overdueCount > 0 && (
        <div className="alert alert-warn" style={{marginBottom:16}}>
          ⚠ {overdueCount} delivery{overdueCount>1?'s are':' is'} overdue. Please update status or reschedule.
        </div>
      )}

      <div className="toolbar">
        <select className="filter-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="scheduled">Scheduled</option>
          <option value="despatched">Despatched</option>
          <option value="all">All</option>
        </select>
        <select className="filter-select" value={filterDate} onChange={e=>setFilterDate(e.target.value)}>
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="this_week">This Week</option>
        </select>
        <select className="filter-select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
          <option value="all">All Branches</option>
          {branches.map(b=><option key={b.id} value={b.id}>{b.name}{b.location?` — ${b.location}`:''}</option>)}
        </select>
        <select className="filter-select" value={filterBilling} onChange={e=>setFilterBilling(e.target.value)}>
          <option value="all">All Billing</option>
          <option value="china">China</option>
          <option value="uk">UK</option>
        </select>
        <div style={{flex:1}}/>
        <span style={{fontSize:12,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{deliveries.length} records</span>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
        ) : deliveries.length===0 ? (
          <div style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:12}}>🚚</div>
            <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No deliveries scheduled</div>
            <div style={{fontSize:13,color:'var(--text-2)'}}>Click "+ Schedule Delivery" to add a delivery</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Job No.</th><th>JADE Ref</th><th>Product</th>
                <th>Pallets</th><th>Cartons</th>
                <th>Delivery Date</th><th>Customer</th><th>Address</th>
                <th>Branch</th><th>Booking Ref</th><th>Billing</th><th>Status</th>
                {!isReadOnly && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {deliveries.map(d => {
                const isOverdue = d.delivery_date && isPast(parseISO(d.delivery_date)) && !isToday(parseISO(d.delivery_date)) && d.status !== 'despatched'
                return (
                  <tr key={d.id} style={isOverdue?{background:'rgba(232,64,64,0.04)'}:{}}>
                    <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',fontWeight:600}}>{d.job_number}</td>
                    <td className="bold mono-sm">{d.jade_reference}</td>
                    <td>{d.product}</td>
                    <td>{d.pallet_amount||'—'}</td>
                    <td>{d.carton_amount||'—'}</td>
                    <td><DateBadge dateStr={d.delivery_date}/></td>
                    <td className="bold">{d.customers?.name||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                    <td style={{fontSize:12,color:'var(--text-1)',maxWidth:180,whiteSpace:'normal',lineHeight:1.3}}>
                      {d.delivery_addresses ? `${d.delivery_addresses.label}, ${d.delivery_addresses.city}` : <span style={{color:'var(--text-3)'}}>—</span>}
                    </td>
                    <td style={{fontSize:12}}>{d.branches?`${d.branches.name}${d.branches.location?` — ${d.branches.location}`:''}` : <span style={{color:'var(--text-3)'}}>—</span>}</td>
                    <td className="mono-sm">{d.booking_reference||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                    <td><Tag billing={d.billing}/></td>
                    <td><Tag status={d.status}/>{isOverdue&&<span style={{marginLeft:4,fontSize:10,color:'var(--red)',fontFamily:'JetBrains Mono'}}>OVERDUE</span>}</td>
                    {!isReadOnly && (
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={()=>setEditRecord(d)}>Edit</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showSchedule && <ScheduleModal onClose={()=>setShowSchedule(false)} onSaved={loadDeliveries}/>}
      {editRecord && <ScheduleModal editRecord={editRecord} onClose={()=>setEditRecord(null)} onSaved={loadDeliveries}/>}
    </div>
  )
}
