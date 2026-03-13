import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import toast from 'react-hot-toast'

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const SectionTitle = ({ children }) => (
  <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--text-3)',marginBottom:14,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>{children}</div>
)
const Field = ({ label, children }) => (
  <div className="field-group"><label className="field-label">{label}</label>{children}</div>
)

// ─── CHARGE RATES TAB ─────────────────────────────────────────────────────────
function ChargeRatesTab() {
  const { user } = useAuth()
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('charge_rates').select('rate_key,rate_value').then(({ data }) => {
      const map = {}
      ;(data||[]).forEach(r => { map[r.rate_key] = r.rate_value })
      setRates(map)
      setLoading(false)
    })
  }, [])

  const set = (k, v) => setRates(r => ({ ...r, [k]: v }))

  async function handleSave() {
    setSaving(true)
    const entries = Object.entries(rates).map(([rate_key, rate_value]) => ({ rate_key, rate_value: parseFloat(rate_value) || 0 }))
    for (const entry of entries) {
      await supabase.from('charge_rates').upsert(entry, { onConflict: 'rate_key' })
    }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, 'charge_rates', 'Charge rates updated')
    setSaving(false)
    toast.success('Charge rates saved')
  }

  if (loading) return <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>

  const rateField = (label, key, suffix = '/unit') => (
    <div className="field-group">
      <label className="field-label">{label}</label>
      <div style={{position:'relative'}}>
        <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>£</span>
        <input className="field-input" type="number" step="0.01" min="0" style={{paddingLeft:26}} value={rates[key]||''} onChange={e=>set(key,e.target.value)} placeholder="0.00" />
      </div>
      <div style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>{suffix}</div>
    </div>
  )

  return (
    <div>
      <SectionTitle>Storage</SectionTitle>
      <div className="form-grid" style={{marginBottom:24}}>
        {rateField('Storage Rate', 'storage_per_pallet_per_day', 'per pallet, per day')}
        {rateField('Free Storage Days', 'storage_free_days', 'days before charges begin')}
      </div>

      <SectionTitle>Handling</SectionTitle>
      <div className="form-grid" style={{marginBottom:24}}>
        {rateField('Handling In (standard)', 'handling_in_per_pallet', 'per pallet')}
        {rateField('Handling Out (standard)', 'handling_out_per_pallet', 'per pallet')}
        {rateField('Handling Out (carton split)', 'handling_out_per_carton_split', 'per carton')}
        {rateField('Packing (carton split)', 'packing_per_carton', 'per carton')}
      </div>

      <SectionTitle>Delivery</SectionTitle>
      <div className="form-grid" style={{marginBottom:32}}>
        {rateField('Delivery Rate', 'delivery_per_pallet', 'per pallet')}
        {rateField('Default Address Cap', 'default_delivery_cap', 'max delivery charge per address')}
      </div>

      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <button className="btn btn-danger" disabled={saving} onClick={handleSave}>{saving?'Saving…':'Save Charge Rates'}</button>
      </div>
    </div>
  )
}

// ─── DELIVERY ADDRESSES TAB ───────────────────────────────────────────────────
function AddressModal({ address, onClose, onSaved }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const blank = { label:'', customer_id:'', address_line1:'', address_line2:'', city:'', postcode:'', max_delivery_cap:'180' }
  const [form, setForm] = useState(address ? { ...blank, ...address, max_delivery_cap: address.max_delivery_cap || '180', country: undefined } : blank)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(() => {
    supabase.from('customers').select('*').order('name').then(({data})=>setCustomers(data||[]))
  }, [])

  async function handleSave() {
    if (!form.label || !form.address_line1 || !form.city) { toast.error('Label, address and city are required'); return }
    setSaving(true)
    const { country, ...formWithoutCountry } = form
    const payload = { ...formWithoutCountry, max_delivery_cap: parseFloat(form.max_delivery_cap)||180, customer_id: form.customer_id||null }
    let error
    if (address) {
      ;({error} = await supabase.from('delivery_addresses').update(payload).eq('id', address.id))
    } else {
      ;({error} = await supabase.from('delivery_addresses').insert(payload))
    }
    if (error) { toast.error(error.message); setSaving(false); return }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, 'delivery_addresses', `Address ${address?'updated':'added'}: ${form.label}`)
    toast.success(address ? 'Address updated' : 'Address added')
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{address ? 'Edit Address' : 'Add Delivery Address'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Field label="Label (short name) *"><input className="field-input" value={form.label} onChange={e=>set('label',e.target.value)} placeholder="e.g. London HQ" /></Field>
          <Field label="Customer (optional)">
            <select className="field-select" value={form.customer_id} onChange={e=>set('customer_id',e.target.value)}>
              <option value="">No specific customer</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Address Line 1 *"><input className="field-input" value={form.address_line1} onChange={e=>set('address_line1',e.target.value)} placeholder="Street address" /></Field>
          <Field label="Address Line 2"><input className="field-input" value={form.address_line2} onChange={e=>set('address_line2',e.target.value)} placeholder="Unit, floor, etc." /></Field>
          <div className="form-grid">
            <Field label="City *"><input className="field-input" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="City" /></Field>
            <Field label="Postcode"><input className="field-input" value={form.postcode} onChange={e=>set('postcode',e.target.value)} placeholder="e.g. EC1A 1BB" /></Field>
          </div>
          <div className="form-grid">
            <Field label="Max Delivery Cap (£)">
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>£</span>
                <input className="field-input" type="number" step="0.01" min="0" style={{paddingLeft:26}} value={form.max_delivery_cap} onChange={e=>set('max_delivery_cap',e.target.value)} />
              </div>
            </Field>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={handleSave}>{saving?'Saving…':address?'Save Changes':'Add Address'}</button>
        </div>
      </div>
    </div>
  )
}

function DeliveryAddressesTab() {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editAddr, setEditAddr] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('delivery_addresses').select('*, customers(name)').order('label')
    setAddresses(data||[])
    setLoading(false)
  }, [])
  useEffect(()=>{load()},[load])

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <SectionTitle>Delivery Addresses</SectionTitle>
        <button className="btn btn-danger btn-sm" onClick={()=>setShowAdd(true)}>+ Add Address</button>
      </div>
      {loading ? <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
      : addresses.length===0 ? <div className="alert alert-info">No delivery addresses yet. Add one to assign stock to delivery locations.</div>
      : <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Label</th><th>Customer</th><th>Address</th><th>City</th><th>Postcode</th><th>Delivery Cap</th><th></th></tr></thead>
          <tbody>
            {addresses.map(a=>(
              <tr key={a.id}>
                <td className="bold">{a.label}</td>
                <td style={{fontSize:12,color:'var(--text-2)'}}>{a.customers?.name||<span style={{color:'var(--text-3)'}}>Any</span>}</td>
                <td style={{fontSize:12}}>{a.address_line1}{a.address_line2?`, ${a.address_line2}`:''}</td>
                <td style={{fontSize:12}}>{a.city}</td>
                <td className="mono-sm">{a.postcode||'—'}</td>
                <td style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--accent)'}}>£{a.max_delivery_cap}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={()=>setEditAddr(a)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      {showAdd && <AddressModal onClose={()=>setShowAdd(false)} onSaved={load}/>}
      {editAddr && <AddressModal address={editAddr} onClose={()=>setEditAddr(null)} onSaved={load}/>}
    </div>
  )
}

// ─── CUSTOMERS TAB ────────────────────────────────────────────────────────────
function CustomerModal({ customer, onClose, onSaved }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: customer?.name||'', contact_name: customer?.contact_name||'', contact_email: customer?.contact_email||'', contact_phone: customer?.contact_phone||'', notes: customer?.notes||'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSave() {
    if (!form.name) { toast.error('Customer name is required'); return }
    setSaving(true)
    let error
    if (customer) {
      ;({error} = await supabase.from('customers').update(form).eq('id',customer.id))
    } else {
      ;({error} = await supabase.from('customers').insert(form))
    }
    if (error) { toast.error(error.message); setSaving(false); return }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, 'customers', `Customer ${customer?'updated':'added'}: ${form.name}`)
    toast.success(customer ? 'Customer updated' : 'Customer added')
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{customer ? 'Edit Customer' : 'Add Customer'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Field label="Customer Name *"><input className="field-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Kaifa Technology" /></Field>
          <div className="form-grid">
            <Field label="Contact Name"><input className="field-input" value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} placeholder="Full name" /></Field>
            <Field label="Contact Email"><input className="field-input" type="email" value={form.contact_email} onChange={e=>set('contact_email',e.target.value)} placeholder="email@company.com" /></Field>
            <Field label="Contact Phone"><input className="field-input" value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)} placeholder="+44 …" /></Field>
          </div>
          <Field label="Notes"><textarea className="field-input" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Any notes about this customer…" /></Field>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={handleSave}>{saving?'Saving…':customer?'Save Changes':'Add Customer'}</button>
        </div>
      </div>
    </div>
  )
}

function CustomersTab() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editCust, setEditCust] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('name')
    setCustomers(data||[])
    setLoading(false)
  }, [])
  useEffect(()=>{load()},[load])

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <SectionTitle>Customers</SectionTitle>
        <button className="btn btn-danger btn-sm" onClick={()=>setShowAdd(true)}>+ Add Customer</button>
      </div>
      {loading ? <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
      : customers.length===0 ? <div className="alert alert-info">No customers yet. Add customers to link deliveries and invoices.</div>
      : <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            {customers.map(c=>(
              <tr key={c.id}>
                <td className="bold">{c.name}</td>
                <td style={{fontSize:12}}>{c.contact_name||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td className="mono-sm">{c.contact_email||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td className="mono-sm">{c.contact_phone||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={()=>setEditCust(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      {showAdd && <CustomerModal onClose={()=>setShowAdd(false)} onSaved={load}/>}
      {editCust && <CustomerModal customer={editCust} onClose={()=>setEditCust(null)} onSaved={load}/>}
    </div>
  )
}

// ─── BRANCHES TAB ─────────────────────────────────────────────────────────────
function BranchModal({ branch, onClose, onSaved }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: branch?.name||'', location: branch?.location||'', contact_email: branch?.contact_email||'', contact_phone: branch?.contact_phone||'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSave() {
    if (!form.name) { toast.error('Branch name is required'); return }
    setSaving(true)
    let error
    if (branch) {
      ;({error} = await supabase.from('branches').update(form).eq('id',branch.id))
    } else {
      ;({error} = await supabase.from('branches').insert(form))
    }
    if (error) { toast.error(error.message); setSaving(false); return }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, 'branches', `Branch ${branch?'updated':'added'}: ${form.name}`)
    toast.success(branch ? 'Branch updated' : 'Branch added')
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{branch ? 'Edit Branch' : 'Add Branch'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Branch Name *"><input className="field-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. DHL East Midlands" /></Field>
            <Field label="Location"><input className="field-input" value={form.location} onChange={e=>set('location',e.target.value)} placeholder="e.g. Nottingham" /></Field>
            <Field label="Contact Email"><input className="field-input" type="email" value={form.contact_email} onChange={e=>set('contact_email',e.target.value)} placeholder="branch@dhl.com" /></Field>
            <Field label="Contact Phone"><input className="field-input" value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)} placeholder="+44 …" /></Field>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={handleSave}>{saving?'Saving…':branch?'Save Changes':'Add Branch'}</button>
        </div>
      </div>
    </div>
  )
}

function BranchesTab() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editBranch, setEditBranch] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('branches').select('*').order('name')
    setBranches(data||[])
    setLoading(false)
  }, [])
  useEffect(()=>{load()},[load])

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <SectionTitle>Branches</SectionTitle>
        <button className="btn btn-danger btn-sm" onClick={()=>setShowAdd(true)}>+ Add Branch</button>
      </div>
      {loading ? <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
      : branches.length===0 ? <div className="alert alert-info">No branches yet. Add branches to assign deliveries to specific DHL locations.</div>
      : <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Name</th><th>Location</th><th>Email</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            {branches.map(b=>(
              <tr key={b.id}>
                <td className="bold">{b.name}</td>
                <td style={{fontSize:12}}>{b.location||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td className="mono-sm">{b.contact_email||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td className="mono-sm">{b.contact_phone||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={()=>setEditBranch(b)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>}
      {showAdd && <BranchModal onClose={()=>setShowAdd(false)} onSaved={load}/>}
      {editBranch && <BranchModal branch={editBranch} onClose={()=>setEditBranch(null)} onSaved={load}/>}
    </div>
  )
}

// ─── HAWB NUMBERS TAB ─────────────────────────────────────────────────────────
function HawbTab() {
  const { user } = useAuth()
  const [hawbs, setHawbs] = useState([])
  const [loading, setLoading] = useState(true)
  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)
  const [stats, setStats] = useState({ available:0, used:0, total:0 })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('hawb_numbers').select('*').order('created_at',{ascending:false}).limit(50)
    const { count: avail } = await supabase.from('hawb_numbers').select('*',{count:'exact',head:true}).eq('status','available')
    const { count: used } = await supabase.from('hawb_numbers').select('*',{count:'exact',head:true}).eq('status','used')
    setHawbs(data||[])
    setStats({ available:avail||0, used:used||0, total:(avail||0)+(used||0) })
    setLoading(false)
  }, [])
  useEffect(()=>{load()},[load])

  async function handleImport() {
    if (!bulkText.trim()) { toast.error('Paste HAWB numbers first'); return }
    const numbers = bulkText.split(/[\n,\s]+/).map(s=>s.trim()).filter(Boolean)
    if (numbers.length === 0) { toast.error('No valid HAWB numbers found'); return }
    setImporting(true)
    const rows = numbers.map(hawb_number => ({ hawb_number, status:'available' }))
    const { error, data } = await supabase.from('hawb_numbers').upsert(rows, { onConflict:'hawb_number', ignoreDuplicates:true }).select()
    if (error) { toast.error(error.message); setImporting(false); return }
    await logAction(user?.id, ACTIONS.SETTINGS_CHANGED, 'hawb_numbers', `Imported ${numbers.length} HAWB numbers`)
    toast.success(`Imported ${data?.length || numbers.length} HAWB numbers`)
    setBulkText('')
    setImporting(false)
    load()
  }

  return (
    <div>
      <SectionTitle>HAWB Number Pool</SectionTitle>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Available',v:stats.available,c:'var(--green)'},{l:'Used',v:stats.used,c:'var(--text-3)'},{l:'Total',v:stats.total,c:'var(--text-0)'}].map(k=>(
          <div key={k.l} style={{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'12px 16px'}}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{k.l}</div>
            <div style={{fontFamily:'Rajdhani',fontSize:26,fontWeight:700,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {stats.available < 5 && <div className="alert alert-warn" style={{marginBottom:16}}>⚠ Low HAWB pool — only {stats.available} number{stats.available!==1?'s':''} remaining. Import more below.</div>}

      <div style={{marginBottom:24,padding:'16px',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3}}>
        <div style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-2)',marginBottom:10}}>BULK IMPORT</div>
        <div style={{fontSize:13,color:'var(--text-2)',marginBottom:10}}>Paste HAWB numbers below — one per line, or comma/space separated. Duplicates are ignored automatically.</div>
        <textarea className="field-input" rows={5} value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={"HAWB001\nHAWB002\nHAWB003\n…"} style={{fontFamily:'JetBrains Mono',fontSize:12,marginBottom:10}} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,color:'var(--text-3)'}}>
            {bulkText.trim() ? `${bulkText.split(/[\n,\s]+/).map(s=>s.trim()).filter(Boolean).length} numbers detected` : ''}
          </span>
          <button className="btn btn-danger" disabled={importing||!bulkText.trim()} onClick={handleImport}>{importing?'Importing…':'Import HAWB Numbers'}</button>
        </div>
      </div>

      {loading ? <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
      : <div className="table-wrap"><table className="data-table">
          <thead><tr><th>HAWB Number</th><th>Status</th><th>Assigned To</th><th>Used At</th></tr></thead>
          <tbody>
            {hawbs.map(h=>(
              <tr key={h.id}>
                <td style={{fontFamily:'JetBrains Mono',fontSize:12,color:'var(--accent)',fontWeight:600}}>{h.hawb_number}</td>
                <td><span className={`tag ${h.status==='available'?'tag-green':'tag-orange'}`}>{h.status.toUpperCase()}</span></td>
                <td className="mono-sm">{h.assigned_to_invoice||<span style={{color:'var(--text-3)'}}>—</span>}</td>
                <td className="mono-sm">{h.used_at?new Date(h.used_at).toLocaleDateString():<span style={{color:'var(--text-3)'}}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>}
    </div>
  )
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user, profile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [form, setForm] = useState({ display_name: profile?.display_name||'' })
  const [pwForm, setPwForm] = useState({ current:'', new_pw:'', confirm:'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const setPw = (k,v) => setPwForm(f=>({...f,[k]:v}))

  async function handleProfileSave() {
    if (!form.display_name) { toast.error('Display name is required'); return }
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ display_name: form.display_name }).eq('id', user?.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Profile updated')
    setSaving(false)
  }

  async function handlePasswordChange() {
    if (!pwForm.new_pw || pwForm.new_pw.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (pwForm.new_pw !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    setChangingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.new_pw })
    if (error) { toast.error(error.message); setChangingPw(false); return }
    toast.success('Password changed successfully')
    setPwForm({ current:'', new_pw:'', confirm:'' })
    setChangingPw(false)
  }

  return (
    <div>
      <SectionTitle>Your Profile</SectionTitle>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24,padding:'16px',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'var(--bg-2)',border:'2px solid var(--dhl-red)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Rajdhani',fontWeight:700,fontSize:22,color:'var(--dhl-yellow)',flexShrink:0}}>
          {(profile?.display_name||user?.email||'?')[0].toUpperCase()}
        </div>
        <div>
          <div style={{fontWeight:600,fontSize:16,color:'var(--text-0)'}}>{profile?.display_name||'—'}</div>
          <div style={{fontSize:13,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{user?.email}</div>
          <div style={{marginTop:4}}><span className={`tag ${profile?.role==='admin'?'tag-red':profile?.role==='limited'?'tag-green':'tag-blue'}`}>{profile?.role?.toUpperCase()}</span></div>
        </div>
      </div>

      <div className="form-grid" style={{marginBottom:24}}>
        <Field label="Display Name"><input className="field-input" value={form.display_name} onChange={e=>set('display_name',e.target.value)} /></Field>
        <Field label="Email"><input className="field-input" value={user?.email||''} readOnly style={{opacity:0.5,fontFamily:'JetBrains Mono',fontSize:13}} /></Field>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:32}}>
        <button className="btn btn-danger" disabled={saving} onClick={handleProfileSave}>{saving?'Saving…':'Save Profile'}</button>
      </div>

      <SectionTitle>Change Password</SectionTitle>
      <div className="form-grid" style={{marginBottom:16}}>
        <Field label="New Password"><input className="field-input" type="password" value={pwForm.new_pw} onChange={e=>setPw('new_pw',e.target.value)} placeholder="Min. 8 characters" /></Field>
        <Field label="Confirm New Password"><input className="field-input" type="password" value={pwForm.confirm} onChange={e=>setPw('confirm',e.target.value)} placeholder="Repeat new password" /></Field>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <button className="btn btn-ghost" disabled={changingPw} onClick={handlePasswordChange}>{changingPw?'Changing…':'Change Password'}</button>
      </div>
    </div>
  )
}

// ─── MAIN SETTINGS PAGE ───────────────────────────────────────────────────────
const TABS = [
  { id:'rates',     label:'Charge Rates',       adminOnly: true  },
  { id:'addresses', label:'Delivery Addresses',  adminOnly: true  },
  { id:'customers', label:'Customers',            adminOnly: true  },
  { id:'branches',  label:'Branches',             adminOnly: true  },
  { id:'hawb',      label:'HAWB Numbers',         adminOnly: true  },
  { id:'profile',   label:'My Profile',           adminOnly: false },
]

export default function SettingsPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const visibleTabs = TABS.filter(t => isAdmin || !t.adminOnly)
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id || 'profile')

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">SYSTEM CONFIGURATION</div>
        </div>
      </div>

      <div style={{display:'flex',gap:0,marginBottom:24,borderBottom:'1px solid var(--border)'}}>
        {visibleTabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:'10px 20px',background:'none',border:'none',borderBottom:`2px solid ${activeTab===t.id?'var(--dhl-red)':'transparent'}`,color:activeTab===t.id?'var(--text-0)':'var(--text-2)',fontFamily:'Rajdhani',fontSize:14,fontWeight:activeTab===t.id?600:400,cursor:'pointer',transition:'all 0.15s',letterSpacing:0.5,marginBottom:-1}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{maxWidth:860}}>
        {activeTab==='rates'     && <ChargeRatesTab/>}
        {activeTab==='addresses' && <DeliveryAddressesTab/>}
        {activeTab==='customers' && <CustomersTab/>}
        {activeTab==='branches'  && <BranchesTab/>}
        {activeTab==='hawb'      && <HawbTab/>}
        {activeTab==='profile'   && <ProfileTab/>}
      </div>
    </div>
  )
}
