import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import toast from 'react-hot-toast'
import { format, differenceInDays } from 'date-fns'
import PodUploader from '../components/PodUploader'

const STATUS_MAP = {
  in_stock:        { cls: 'tag-green',  label: 'IN STOCK' },
  part_despatched: { cls: 'tag-yellow', label: 'PART DESP.' },
  despatched:      { cls: 'tag-blue',   label: 'DESPATCHED' },
  invoiced:        { cls: 'tag-red',    label: 'INVOICED' },
}

const Tag = ({ status, billing }) => {
  if (billing) return <span className={`tag ${billing === 'china' ? 'tag-red' : 'tag-blue'}`}>{billing.toUpperCase()}</span>
  const { cls, label } = STATUS_MAP[status] || { cls: 'tag-orange', label: status }
  return <span className={`tag ${cls}`}>{label}</span>
}

const JobTag = ({ number }) => (
  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{number}</span>
)

const DaysBadge = ({ receiveDate }) => {
  if (!receiveDate) return null
  const days = differenceInDays(new Date(), new Date(receiveDate))
  const color = days > 14 ? 'var(--red)' : days >= 10 ? 'var(--accent)' : 'var(--green)'
  return <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color }}>{days}d</span>
}

function StockModal({ onClose, onSaved, editRecord = null }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const FALLBACK_PRODUCTS = ['UK Charger','CN Charger','Power Bank','EV Module','Solar Unit','Battery Pack','Inverter']
  const [products, setProducts] = useState(FALLBACK_PRODUCTS)
  useEffect(() => {
    supabase.from('products').select('name').order('name').then(({ data, error }) => {
      if (!error && data && data.length > 0) setProducts(data.map(p => p.name))
    })
  }, [])
  const blank = { jade_reference:'',customer_po:'',product:'',stock_amount:'',carton_amount:'',pallet_amount:'',weight_kg:'',dimensions_mm:'',receive_date:format(new Date(),'yyyy-MM-dd'),warehouse_location:'',pallet_numbers:'',carton_numbers:'',billing:'uk',delivery_instructions:'',internal_notes:'' }
  const [form, setForm] = useState(editRecord ? { ...blank, ...editRecord, receive_date: editRecord.receive_date || format(new Date(),'yyyy-MM-dd') } : blank)
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  async function handleSave() {
    if (!form.jade_reference || !form.product || !form.receive_date) { toast.error('JADE reference, product and receive date are required'); return }
    setSaving(true)
    const payload = { ...form, stock_amount:parseInt(form.stock_amount)||0, carton_amount:parseInt(form.carton_amount)||0, pallet_amount:parseInt(form.pallet_amount)||0, weight_kg:parseFloat(form.weight_kg)||null, created_by:user?.id }
    let error
    if (editRecord) {
      ;({error} = await supabase.from('stock').update(payload).eq('id',editRecord.id))
      if (!error) await logAction(user?.id, ACTIONS.STOCK_UPDATED, form.jade_reference, 'Stock line updated')
    } else {
      ;({error} = await supabase.from('stock').insert(payload))
      if (!error) await logAction(user?.id, ACTIONS.STOCK_ADDED, form.jade_reference, `New stock received: ${form.product}`)
    }
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editRecord ? 'Stock line updated' : 'Stock line added!')
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div className="modal-title">{editRecord ? `Edit ${editRecord.job_number}` : 'Add New Stock Line'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-section">INBOUND INFORMATION</div>
          <div className="form-grid">
            <div className="field-group"><label className="field-label">JADE Reference *</label><input className="field-input" value={form.jade_reference} onChange={e=>set('jade_reference',e.target.value)} placeholder="e.g. JADE-2024-0892" /></div>
            <div className="field-group"><label className="field-label">Customer PO Number</label><input className="field-input" value={form.customer_po} onChange={e=>set('customer_po',e.target.value)} placeholder="e.g. PO-8822" /></div>
            <div className="field-group"><label className="field-label">Product *</label><select className="field-select" value={form.product} onChange={e=>set('product',e.target.value)}><option value="">Select product…</option>{products.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
            <div className="field-group"><label className="field-label">Receive Date *</label><input className="field-input" type="date" value={form.receive_date} onChange={e=>set('receive_date',e.target.value)} /></div>
          </div>
          <div className="form-section">QUANTITIES &amp; DIMENSIONS</div>
          <div className="form-grid-3">
            <div className="field-group"><label className="field-label">Pallet Amount</label><input className="field-input" type="number" min="0" value={form.pallet_amount} onChange={e=>set('pallet_amount',e.target.value)} placeholder="0" /></div>
            <div className="field-group"><label className="field-label">Carton Amount</label><input className="field-input" type="number" min="0" value={form.carton_amount} onChange={e=>set('carton_amount',e.target.value)} placeholder="0" /></div>
            <div className="field-group"><label className="field-label">Stock Amount</label><input className="field-input" type="number" min="0" value={form.stock_amount} onChange={e=>set('stock_amount',e.target.value)} placeholder="0" /></div>
            <div className="field-group"><label className="field-label">Weight (KG)</label><input className="field-input" type="number" step="0.1" min="0" value={form.weight_kg} onChange={e=>set('weight_kg',e.target.value)} placeholder="0.0" /></div>
            <div className="field-group"><label className="field-label">Dimensions (mm)</label><input className="field-input" value={form.dimensions_mm} onChange={e=>set('dimensions_mm',e.target.value)} placeholder="L × W × H" /></div>
            <div className="field-group"><label className="field-label">Warehouse Location</label><input className="field-input" value={form.warehouse_location} onChange={e=>set('warehouse_location',e.target.value)} placeholder="e.g. A-04" /></div>
          </div>
          <div className="form-grid">
            <div className="field-group"><label className="field-label">Pallet Numbers</label><input className="field-input" value={form.pallet_numbers} onChange={e=>set('pallet_numbers',e.target.value)} placeholder="e.g. P001, P002" /></div>
            <div className="field-group"><label className="field-label">Carton Numbers</label><input className="field-input" value={form.carton_numbers} onChange={e=>set('carton_numbers',e.target.value)} placeholder="e.g. C001–C048" /></div>
          </div>
          <div className="form-section">BILLING</div>
          <div className="field-group" style={{maxWidth:240}}><label className="field-label">Chargeable To</label><select className="field-select" value={form.billing} onChange={e=>set('billing',e.target.value)}><option value="uk">UK</option><option value="china">China</option></select></div>
          <div className="form-section">NOTES</div>
          <div className="field-group"><label className="field-label">Delivery Instructions</label><textarea className="field-input" rows={2} value={form.delivery_instructions} onChange={e=>set('delivery_instructions',e.target.value)} placeholder="Any specific delivery instructions…" /></div>
          <div className="field-group"><label className="field-label">Internal Notes <span style={{color:'var(--text-3)',fontSize:10}}>(never shown on invoices)</span></label><textarea className="field-input" rows={2} value={form.internal_notes} onChange={e=>set('internal_notes',e.target.value)} placeholder="Internal notes only…" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : editRecord ? 'Save Changes' : 'Add Stock Line'}</button>
        </div>
      </div>
    </div>
  )
}

function SplitModal({ stock, onClose, onSaved }) {
  const { user } = useAuth()
  const [splitType, setSplitType] = useState('carton')
  const [cartonQty, setCartonQty] = useState(1)
  const [palletQty, setPalletQty] = useState(1)
  const [saving, setSaving] = useState(false)
  const qty = splitType === 'carton' ? cartonQty : palletQty

  async function handleSplit() {
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return }
    const maxQty = splitType === 'carton' ? stock.carton_amount : stock.pallet_amount
    if (qty > maxQty) { toast.error(`Cannot split more than ${maxQty} ${splitType}s`); return }
    setSaving(true)
    const { count } = await supabase.from('stock').select('*',{count:'exact',head:true}).eq('parent_stock_id',stock.id)
    const suffix = `S${(count||0)+1}`
    const { error } = await supabase.from('stock').insert({
      jade_reference:`${stock.jade_reference}-${suffix}`,
      job_number:`${stock.job_number}-${suffix}`,
      customer_po:stock.customer_po, product:stock.product, billing:stock.billing,
      receive_date:stock.receive_date, warehouse_location:stock.warehouse_location,
      pallet_amount:splitType==='pallet'?palletQty:0, carton_amount:splitType==='carton'?cartonQty:0,
      stock_amount:0, parent_stock_id:stock.id, is_split:true, split_type:splitType,
      status:'in_stock', created_by:user?.id,
    })
    if (error) { toast.error(error.message); setSaving(false); return }
    const upd = splitType==='carton' ? {carton_amount:stock.carton_amount-cartonQty,status:'part_despatched'} : {pallet_amount:stock.pallet_amount-palletQty,status:'part_despatched'}
    await supabase.from('stock').update(upd).eq('id',stock.id)
    await logAction(user?.id, ACTIONS.STOCK_SPLIT, stock.jade_reference, `Split ${qty} ${splitType}(s)`)
    setSaving(false)
    toast.success('Split created!')
    onSaved(); onClose()
  }

  const cartonCost = (cartonQty*0.50).toFixed(2)
  const palletHdlIn = (palletQty*5.48).toFixed(2)
  const palletHdlOut = (palletQty*2.50).toFixed(2)

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Split Stock Line</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'10px 14px',marginBottom:16,fontSize:13}}>
            <span style={{color:'var(--accent)',fontFamily:'JetBrains Mono'}}>{stock.job_number}</span>
            <span style={{color:'var(--text-2)',margin:'0 8px'}}>·</span><span>{stock.jade_reference}</span>
            <span style={{color:'var(--text-2)',margin:'0 8px'}}>·</span><span>{stock.product}</span>
            <span style={{color:'var(--text-2)',margin:'0 8px'}}>·</span><span>{stock.pallet_amount}P / {stock.carton_amount}C</span>
          </div>
          {splitType==='carton'
            ? <div className="alert alert-warn">Carton split: <strong>no storage or handling-in charge</strong>. Packing & handling-out (£0.50/carton) apply.</div>
            : <div className="alert alert-info">Pallet split: <strong>full storage and handling charges apply</strong> to the split pallet(s).</div>
          }
          <div className="field-group"><label className="field-label">Split Type</label>
            <select className="field-select" value={splitType} onChange={e=>setSplitType(e.target.value)}>
              <option value="carton">Cartons — no storage or handling-in charge</option>
              <option value="pallet">Pallets — full charges apply</option>
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">{splitType==='carton'?`Cartons to split (max ${stock.carton_amount})`:`Pallets to split (max ${stock.pallet_amount})`}</label>
            {splitType==='carton'
              ? <input className="field-input" type="number" min="1" max={stock.carton_amount} value={cartonQty} onChange={e=>setCartonQty(parseInt(e.target.value)||1)} />
              : <input className="field-input" type="number" min="1" max={stock.pallet_amount} value={palletQty} onChange={e=>setPalletQty(parseInt(e.target.value)||1)} />
            }
          </div>
          <div style={{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'12px 16px'}}>
            {splitType==='carton' ? <>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-1)'}}>Packing ({cartonQty} × £0.50)</span><span style={{fontFamily:'JetBrains Mono'}}>£{cartonCost}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-1)'}}>Handling out ({cartonQty} × £0.50)</span><span style={{fontFamily:'JetBrains Mono'}}>£{cartonCost}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-1)'}}>Storage</span><span style={{color:'var(--green)',fontFamily:'JetBrains Mono'}}>£0.00 — waived</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}><span style={{color:'var(--text-1)'}}>Handling in</span><span style={{color:'var(--green)',fontFamily:'JetBrains Mono'}}>£0.00 — waived</span></div>
            </> : <>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-1)'}}>Handling in ({palletQty} × £5.48)</span><span style={{fontFamily:'JetBrains Mono'}}>£{palletHdlIn}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-1)'}}>Handling out ({palletQty} × £2.50)</span><span style={{fontFamily:'JetBrains Mono'}}>£{palletHdlOut}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}><span style={{color:'var(--text-1)'}}>Storage & delivery</span><span style={{color:'var(--accent)',fontFamily:'JetBrains Mono'}}>Calculated on invoice</span></div>
            </>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={handleSplit}>{saving?'Splitting…':'Confirm Split'}</button>
        </div>
      </div>
    </div>
  )
}

function StockDetailModal({ stock, onClose, onEdit, onSplit, isReadOnly }) {
  const [splits, setSplits] = useState([])
  useEffect(() => {
    supabase.from('stock').select('*').eq('parent_stock_id',stock.id).then(({data})=>setSplits(data||[]))
  }, [stock.id])

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <div className="modal-title">{stock.jade_reference}</div>
            <div style={{fontSize:12,color:'var(--text-2)',marginTop:2,display:'flex',gap:8,alignItems:'center'}}>
              <JobTag number={stock.job_number} /><Tag status={stock.status} /><Tag billing={stock.billing} />
            </div>
          </div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:20}}>
            {[['Pallets',stock.pallet_amount],['Cartons',stock.carton_amount],['Weight',`${stock.weight_kg||'—'} kg`]].map(([l,v])=>(
              <div key={l} style={{background:'var(--bg-3)',borderRadius:3,padding:'12px 16px'}}>
                <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{l}</div>
                <div style={{fontFamily:'Rajdhani',fontSize:28,fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
          <div className="form-grid" style={{marginBottom:16}}>
            {[['Customer PO',stock.customer_po||'—'],['Product',stock.product],['Received',stock.receive_date?format(new Date(stock.receive_date),'dd MMM yyyy'):'—'],['Location',stock.warehouse_location||'—'],['Dimensions',stock.dimensions_mm||'—'],['Days Stored',stock.receive_date?`${differenceInDays(new Date(),new Date(stock.receive_date))} days`:'—']].map(([l,v])=>(
              <div key={l}><div style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:1,textTransform:'uppercase',color:'var(--text-3)',marginBottom:3}}>{l}</div><div style={{fontSize:14,color:'var(--text-0)'}}>{v}</div></div>
            ))}
          </div>
          {stock.pallet_numbers&&<div style={{marginBottom:10}}><div style={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--text-3)',marginBottom:3}}>PALLET NUMBERS</div><div style={{fontSize:13,color:'var(--text-1)'}}>{stock.pallet_numbers}</div></div>}
          {stock.carton_numbers&&<div style={{marginBottom:10}}><div style={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--text-3)',marginBottom:3}}>CARTON NUMBERS</div><div style={{fontSize:13,color:'var(--text-1)'}}>{stock.carton_numbers}</div></div>}
          {stock.delivery_instructions&&<div style={{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'10px 14px',marginBottom:10}}><div style={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--text-3)',marginBottom:4}}>DELIVERY INSTRUCTIONS</div><div style={{fontSize:13,color:'var(--text-1)'}}>{stock.delivery_instructions}</div></div>}
          {stock.internal_notes&&<div style={{background:'rgba(232,160,32,0.06)',border:'1px solid rgba(232,160,32,0.2)',borderRadius:3,padding:'10px 14px',marginBottom:16}}><div style={{fontFamily:'JetBrains Mono',fontSize:10,color:'var(--accent)',marginBottom:4}}>INTERNAL NOTES (NOT ON INVOICES)</div><div style={{fontSize:13,color:'var(--text-1)'}}>{stock.internal_notes}</div></div>}
          <div style={{borderTop:'1px solid var(--border)',paddingTop:16,marginTop:4}}><PodUploader stockId={stock.id} stockRef={stock.jade_reference} isReadOnly={isReadOnly}/></div>
          {splits.length>0&&<><div className="form-section" style={{marginTop:0}}>SPLIT HISTORY</div><div className="table-wrap"><table className="data-table"><thead><tr><th>Split Ref</th><th>Type</th><th>Pallets</th><th>Cartons</th><th>Status</th></tr></thead><tbody>{splits.map(s=><tr key={s.id}><td className="bold mono-sm">{s.jade_reference}</td><td><span className={`tag ${s.split_type==='pallet'?'tag-orange':'tag-blue'}`}>{s.split_type?.toUpperCase()}</span></td><td>{s.pallet_amount||'—'}</td><td>{s.carton_amount||'—'}</td><td><Tag status={s.status}/></td></tr>)}</tbody></table></div></>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {!isReadOnly&&!stock.is_split&&<button className="btn btn-ghost" onClick={()=>{onClose();onSplit(stock)}}>Split Line</button>}
          {!isReadOnly&&<button className="btn btn-ghost" onClick={()=>{onClose();onEdit(stock)}}>Edit</button>}
        </div>
      </div>
    </div>
  )
}

export default function StockPage() {
  const { isReadOnly } = useAuth()
  const FALLBACK_PRODUCTS = ['UK Charger','CN Charger','Power Bank','EV Module','Solar Unit','Battery Pack','Inverter']
  const [stock, setStock] = useState([])
  const [products, setProducts] = useState(FALLBACK_PRODUCTS)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterBilling, setFilterBilling] = useState('all')
  const [filterProduct, setFilterProduct] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [splitRecord, setSplitRecord] = useState(null)
  const [detailRecord, setDetailRecord] = useState(null)

  useEffect(() => {
    supabase.from('products').select('name').order('name').then(({ data, error }) => {
      if (!error && data && data.length > 0) setProducts(data.map(p => p.name))
    })
  }, [])

  const loadStock = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('stock').select('*').order('created_at',{ascending:false})
    if (filterStatus!=='all') q=q.eq('status',filterStatus)
    if (filterBilling!=='all') q=q.eq('billing',filterBilling)
    if (filterProduct!=='all') q=q.eq('product',filterProduct)
    const {data,error}=await q
    if (error) toast.error('Failed to load stock')
    else setStock(data||[])
    setLoading(false)
  }, [filterStatus,filterBilling,filterProduct])

  useEffect(()=>{loadStock()},[loadStock])


  const filtered = stock.filter(s => {
    if (!search) return true
    const q=search.toLowerCase()
    return s.jade_reference?.toLowerCase().includes(q)||s.job_number?.toLowerCase().includes(q)||s.customer_po?.toLowerCase().includes(q)||s.product?.toLowerCase().includes(q)||s.warehouse_location?.toLowerCase().includes(q)
  })

  const grouped=[]
  const parents=filtered.filter(s=>!s.is_split)
  const children=filtered.filter(s=>s.is_split)
  parents.forEach(p=>{
    grouped.push({...p,_isParent:true})
    children.filter(c=>c.parent_stock_id===p.id).forEach(c=>grouped.push({...c,_isChild:true}))
  })
  children.filter(c=>!parents.find(p=>p.id===c.parent_stock_id)).forEach(c=>grouped.push({...c,_isChild:true}))

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Stock / Inventory</div>
          <div className="page-subtitle">{stock.length} TOTAL · {stock.filter(s=>s.status==='in_stock').length} IN STOCK · {stock.filter(s=>s.status==='part_despatched').length} PART DESPATCHED</div>
        </div>
        {!isReadOnly&&<button className="btn btn-danger" onClick={()=>setShowAdd(true)}>+ Add Stock</button>}
      </div>

      <div className="toolbar">
        <input className="field-input" style={{width:240,padding:'7px 12px',fontSize:13}} placeholder="Search JADE, Job No., PO, product…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="filter-select" value={filterProduct} onChange={e=>setFilterProduct(e.target.value)}>
          <option value="all">All Products</option>
          {products.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="in_stock">In Stock</option>
          <option value="part_despatched">Part Despatched</option>
          <option value="despatched">Despatched</option>
          <option value="invoiced">Invoiced</option>
        </select>
        <select className="filter-select" value={filterBilling} onChange={e=>setFilterBilling(e.target.value)}>
          <option value="all">All Billing</option>
          <option value="china">China</option>
          <option value="uk">UK</option>
        </select>
        <div style={{flex:1}}/>
        <span style={{fontSize:12,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{filtered.length} records</span>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
        ) : grouped.length===0 ? (
          <div style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:12}}>📦</div>
            <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No stock records yet</div>
            <div style={{fontSize:13,color:'var(--text-2)'}}>Click "+ Add Stock" to add your first stock line</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Job No.</th><th>JADE Ref</th><th>Cust PO</th><th>Product</th>
                <th>Pallets</th><th>Cartons</th><th>Weight</th><th>Received</th>
                <th>Age</th><th>Location</th><th>Status</th><th>Billing</th>
                {!isReadOnly&&<th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {grouped.map(s=>(
                <tr key={s.id} className="clickable" onClick={()=>setDetailRecord(s)} style={s._isChild?{background:'rgba(48,144,232,0.03)'}:{}}>
                  <td style={s._isChild?{paddingLeft:28}:{}}>
                    {s._isChild&&<span style={{marginRight:6,color:'var(--text-3)'}}>↳</span>}
                    <JobTag number={s.job_number}/>
                  </td>
                  <td className="bold mono-sm" style={s._isChild?{color:'var(--text-2)'}:{}}>{s.jade_reference}</td>
                  <td className="mono-sm">{s.customer_po||'—'}</td>
                  <td>{s.product}</td>
                  <td>{s.pallet_amount||'—'}</td>
                  <td>{s.carton_amount||'—'}</td>
                  <td>{s.weight_kg?`${s.weight_kg}kg`:'—'}</td>
                  <td className="mono-sm">{s.receive_date?format(new Date(s.receive_date),'dd/MM/yy'):'—'}</td>
                  <td><DaysBadge receiveDate={s.receive_date}/></td>
                  <td>{s.warehouse_location||'—'}</td>
                  <td><Tag status={s.status}/></td>
                  <td><Tag billing={s.billing}/></td>
                  {!isReadOnly&&(
                    <td onClick={e=>e.stopPropagation()}>
                      {!s.is_split&&(s.status==='in_stock'||s.status==='part_despatched')&&(
                        <button className="btn btn-sm btn-secondary" onClick={()=>setSplitRecord(s)}>Split</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd&&<StockModal onClose={()=>setShowAdd(false)} onSaved={loadStock} products={products}/>}
      {editRecord&&<StockModal onClose={()=>setEditRecord(null)} onSaved={loadStock} editRecord={editRecord} products={products}/>}
      {splitRecord&&<SplitModal stock={splitRecord} onClose={()=>setSplitRecord(null)} onSaved={loadStock}/>}
      {detailRecord&&<StockDetailModal stock={detailRecord} onClose={()=>setDetailRecord(null)} onEdit={s=>{setDetailRecord(null);setEditRecord(s)}} onSplit={s=>{setDetailRecord(null);setSplitRecord(s)}} isReadOnly={isReadOnly}/>}
    </div>
  )
}
