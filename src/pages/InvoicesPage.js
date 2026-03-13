import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import { calculateCharges, applyAddressCap, formatGBP } from '../lib/charges'
import toast from 'react-hot-toast'
import { format, differenceInDays } from 'date-fns'

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const INV_STATUS = {
  draft:    { cls: 'tag-yellow', label: 'DRAFT' },
  sent:     { cls: 'tag-blue',   label: 'SENT' },
  approved: { cls: 'tag-green',  label: 'APPROVED' },
}
const Tag = ({ status, billing }) => {
  if (billing) return <span className={`tag ${billing==='china'?'tag-red':'tag-blue'}`}>{billing.toUpperCase()}</span>
  const { cls, label } = INV_STATUS[status] || { cls:'tag-orange', label:status }
  return <span className={`tag ${cls}`}>{label}</span>
}
const HawbBadge = ({ number }) => number ? (
  <span style={{fontFamily:'JetBrains Mono',fontSize:11,background:'rgba(232,160,32,0.12)',border:'1px solid rgba(232,160,32,0.3)',color:'var(--accent)',padding:'2px 8px',borderRadius:3,letterSpacing:1}}>{number}</span>
) : <span style={{color:'var(--text-3)',fontSize:12}}>—</span>

// ─── CREATE INVOICE MODAL ─────────────────────────────────────────────────────
function CreateInvoiceModal({ onClose, onSaved }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [billing, setBilling] = useState('uk')
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(),'yyyy-MM-dd'))
  const [availableStock, setAvailableStock] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [addresses, setAddresses] = useState([])
  const [rates, setRates] = useState({})
  const [lines, setLines] = useState([])
  const [overrideTotal, setOverrideTotal] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [nextHawb, setNextHawb] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingStock, setLoadingStock] = useState(false)

  useEffect(() => { loadSetup() }, [billing, loadSetup]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSetup() {
    setLoadingStock(true)
    const [stockRes, addrRes, ratesRes, hawbRes] = await Promise.all([
      supabase.from('stock').select('*').eq('billing', billing).in('status',['in_stock','part_despatched']).order('receive_date',{ascending:true}),
      supabase.from('delivery_addresses').select('*, customers(name)'),
      supabase.from('charge_rates').select('rate_key, rate_value'),
      supabase.from('hawb_numbers').select('hawb_number').eq('status','available').order('created_at',{ascending:true}).limit(1),
    ])
    setAvailableStock(stockRes.data || [])
    setAddresses(addrRes.data || [])
    const rateMap = {}
    ;(ratesRes.data||[]).forEach(r => { rateMap[r.rate_key] = parseFloat(r.rate_value) })
    setRates(rateMap)
    setNextHawb(hawbRes.data?.[0]?.hawb_number || null)
    setLoadingStock(false)
  }

  function toggleLine(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
  }

  function calcLines() {
    const selected = availableStock.filter(s => selectedIds.includes(s.id))
    // Group by delivery address to apply caps
    const byAddress = {}
    selected.forEach(s => {
      const key = s.delivery_address_id || 'none'
      if (!byAddress[key]) byAddress[key] = []
      byAddress[key].push(s)
    })
    const allLines = []
    Object.entries(byAddress).forEach(([addrKey, stockItems]) => {
      const addr = addresses.find(a => a.id === addrKey)
      const cap = addr?.max_delivery_cap || null
      let calculated = stockItems.map(s => ({
        stock_id: s.id,
        jade_reference: s.jade_reference,
        job_number: s.job_number,
        product: s.product,
        pallet_amount: s.pallet_amount,
        carton_amount: s.carton_amount,
        is_split: s.is_split,
        split_type: s.split_type,
        receive_date: s.receive_date,
        ...calculateCharges(s, invoiceDate, cap, rates),
      }))
      calculated = applyAddressCap(calculated, cap)
      allLines.push(...calculated)
    })
    setLines(allLines)
    setStep(2)
  }

  const grandTotal = lines.reduce((s,l) => s + l.line_total, 0)
  const finalTotal = overrideTotal ? parseFloat(overrideTotal) : grandTotal

  async function handleCreate(asDraft = false) {
    if (lines.length === 0) { toast.error('Select at least one stock line'); return }
    setSaving(true)

    // Create invoice
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      billing,
      invoice_date: invoiceDate,
      hawb_number: nextHawb,
      status: asDraft ? 'draft' : 'sent',
      total_storage: lines.reduce((s,l)=>s+l.storage_charge,0),
      total_handling_in: lines.reduce((s,l)=>s+l.handling_in_charge,0),
      total_handling_out: lines.reduce((s,l)=>s+l.handling_out_charge,0),
      total_delivery: lines.reduce((s,l)=>s+l.delivery_charge,0),
      total_packing: lines.reduce((s,l)=>s+l.packing_charge,0),
      total_amount: grandTotal,
      override_total: overrideTotal ? parseFloat(overrideTotal) : null,
      override_reason: overrideReason || null,
      created_by: user?.id,
    }).select().single()
    if (invErr) { toast.error(invErr.message); setSaving(false); return }

    // Insert invoice lines
    const lineRows = lines.map(l => ({
      invoice_id: inv.id,
      stock_id: l.stock_id,
      days_stored: l.days_stored || 0,
      chargeable_days: l.chargeable_days || 0,
      storage_charge: l.storage_charge || 0,
      handling_in_charge: l.handling_in_charge || 0,
      handling_out_charge: l.handling_out_charge || 0,
      delivery_charge: l.delivery_charge || 0,
      packing_charge: l.packing_charge || 0,
      line_total: l.line_total || 0,
    }))
    const { error: lineErr } = await supabase.from('invoice_lines').insert(lineRows)
    if (lineErr) { toast.error(lineErr.message); setSaving(false); return }

    // Mark stock as invoiced
    await supabase.from('stock').update({ status:'invoiced' }).in('id', selectedIds)

    // Mark HAWB as used
    if (nextHawb) {
      await supabase.from('hawb_numbers').update({ status:'used', assigned_to_invoice:inv.id, used_at:new Date().toISOString() }).eq('hawb_number', nextHawb)
    }

    // Log override if applied
    if (overrideTotal) await logAction(user?.id, ACTIONS.PRICE_OVERRIDE, inv.invoice_number, `Total overridden from ${formatGBP(grandTotal)} to ${formatGBP(parseFloat(overrideTotal))}. Reason: ${overrideReason}`)
    await logAction(user?.id, asDraft ? ACTIONS.INVOICE_CREATED : ACTIONS.INVOICE_SENT, inv.invoice_number, `Invoice ${asDraft?'saved as draft':'created and sent'} — ${formatGBP(finalTotal)}`)

    setSaving(false)
    toast.success(asDraft ? 'Invoice saved as draft' : 'Invoice created!')
    onSaved(); onClose()
  }

  const stockEstimate = (s) => {
    const days = differenceInDays(new Date(invoiceDate), new Date(s.receive_date))
    const r = rates
    if (s.is_split && s.split_type === 'carton') return (s.carton_amount||0) * ((r.packing_per_carton||0.5) + (r.handling_out_per_carton_split||0.5))
    const pallets = s.pallet_amount || 0
    const freeDays = r.storage_free_days || 14
    const chargeableDays = Math.max(0, days - freeDays)
    return pallets * chargeableDays * (r.storage_per_pallet_per_day||0.69) + pallets * (r.handling_in_per_pallet||5.48) + pallets * (r.handling_out_per_pallet||2.50) + Math.min(pallets * (r.delivery_per_pallet||60), 180)
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <div className="modal-title">{step===1 ? 'Create Invoice — Select Shipments' : 'Create Invoice — Review Charges'}</div>
            <div style={{fontSize:12,color:'var(--text-2)',marginTop:2}}>Step {step} of 2</div>
          </div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {step === 1 && <>
            <div className="form-grid" style={{marginBottom:20}}>
              <div className="field-group">
                <label className="field-label">Billing</label>
                <select className="field-select" value={billing} onChange={e=>{setBilling(e.target.value);setSelectedIds([])}}>
                  <option value="uk">UK</option>
                  <option value="china">China</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Invoice Date</label>
                <input className="field-input" type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} />
              </div>
            </div>

            <div style={{marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-2)'}}>Available Stock — {billing.toUpperCase()} Billing</div>
              <div style={{fontSize:12,color:'var(--text-2)'}}>{selectedIds.length} selected</div>
            </div>

            {loadingStock ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
            ) : availableStock.length === 0 ? (
              <div className="alert alert-info">No active {billing.toUpperCase()} stock lines available to invoice.</div>
            ) : (
              <div style={{border:'1px solid var(--border)',borderRadius:3,overflow:'hidden',maxHeight:320,overflowY:'auto'}}>
                {availableStock.map((s,i) => {
                  const est = stockEstimate(s)
                  const days = differenceInDays(new Date(invoiceDate), new Date(s.receive_date))
                  const checked = selectedIds.includes(s.id)
                  return (
                    <div key={s.id} onClick={()=>toggleLine(s.id)} style={{padding:'10px 14px',borderBottom:i<availableStock.length-1?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:12,cursor:'pointer',background:checked?'rgba(48,144,232,0.05)':'',transition:'background 0.1s'}}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleLine(s.id)} onClick={e=>e.stopPropagation()} style={{width:14,height:14,accentColor:'var(--blue)',flexShrink:0}} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
                          <span style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',fontWeight:600}}>{s.job_number}</span>
                          <span style={{fontSize:13,fontWeight:500,color:'var(--text-0)'}}>{s.jade_reference}</span>
                          <span className={`tag ${s.is_split&&s.split_type==='carton'?'tag-blue':'tag-green'}`} style={{fontSize:10}}>{s.is_split?`SPLIT·${s.split_type?.toUpperCase()}`:'STANDARD'}</span>
                        </div>
                        <div style={{fontSize:12,color:'var(--text-2)'}}>
                          {s.product} · {s.pallet_amount||0}P / {s.carton_amount||0}C · Received {format(new Date(s.receive_date),'dd/MM/yy')} · <span style={{color:days>14?'var(--red)':days>=10?'var(--accent)':'var(--green)'}}>{days} days stored</span>
                        </div>
                      </div>
                      <div style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:600,color:'var(--accent)',flexShrink:0}}>~{formatGBP(est)}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {nextHawb && (
              <div style={{marginTop:16,display:'flex',alignItems:'center',gap:10,fontSize:13,color:'var(--text-2)'}}>
                <span>Next HAWB:</span><HawbBadge number={nextHawb}/><span style={{fontSize:11,color:'var(--text-3)'}}>auto-assigned on creation</span>
              </div>
            )}
            {!nextHawb && <div className="alert alert-warn" style={{marginTop:16}}>⚠ No HAWB numbers available. Import more in Settings → HAWB Numbers.</div>}
          </>}

          {step === 2 && <>
            <div style={{marginBottom:16,padding:'10px 14px',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
              <div><span style={{fontSize:11,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase',letterSpacing:1}}>Billing</span><div style={{fontWeight:600,color:'var(--text-0)',marginTop:2}}>{billing.toUpperCase()}</div></div>
              <div><span style={{fontSize:11,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase',letterSpacing:1}}>Date</span><div style={{fontWeight:600,color:'var(--text-0)',marginTop:2}}>{format(new Date(invoiceDate),'dd MMM yyyy')}</div></div>
              <div><span style={{fontSize:11,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase',letterSpacing:1}}>HAWB</span><div style={{marginTop:2}}><HawbBadge number={nextHawb}/></div></div>
              <div><span style={{fontSize:11,color:'var(--text-3)',fontFamily:'JetBrains Mono',textTransform:'uppercase',letterSpacing:1}}>Lines</span><div style={{fontWeight:600,color:'var(--text-0)',marginTop:2}}>{lines.length}</div></div>
            </div>

            <div className="table-wrap" style={{marginBottom:16}}>
              <table className="data-table">
                <thead>
                  <tr><th>Job No.</th><th>JADE Ref</th><th>Product</th><th>Days</th><th>Storage</th><th>Hdl In</th><th>Hdl Out</th><th>Delivery</th><th>Packing</th><th>Line Total</th></tr>
                </thead>
                <tbody>
                  {lines.map((l,i) => (
                    <tr key={i}>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)'}}>{l.job_number}</td>
                      <td className="bold mono-sm">{l.jade_reference}</td>
                      <td>{l.product}</td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{l.chargeable_days}d <span style={{color:'var(--text-3)',fontSize:10}}>({l.days_stored}d total)</span></td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:l.storage_charge===0?'var(--green)':'var(--text-0)'}}>{formatGBP(l.storage_charge)}</td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:l.handling_in_charge===0?'var(--green)':'var(--text-0)'}}>{formatGBP(l.handling_in_charge)}</td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{formatGBP(l.handling_out_charge)}</td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{formatGBP(l.delivery_charge)}</td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{formatGBP(l.packing_charge)}</td>
                      <td style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600,color:'var(--text-0)'}}>{formatGBP(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{maxWidth:360,marginLeft:'auto',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'14px 16px'}}>
              {[
                ['Storage',lines.reduce((s,l)=>s+l.storage_charge,0)],
                ['Handling In',lines.reduce((s,l)=>s+l.handling_in_charge,0)],
                ['Handling Out',lines.reduce((s,l)=>s+l.handling_out_charge,0)],
                ['Delivery',lines.reduce((s,l)=>s+l.delivery_charge,0)],
                ['Packing',lines.reduce((s,l)=>s+l.packing_charge,0)],
              ].map(([label,val])=>(
                <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span style={{color:'var(--text-1)'}}>{label}</span>
                  <span style={{fontFamily:'JetBrains Mono',color:val===0?'var(--text-3)':'var(--text-0)'}}>{formatGBP(val)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 4px',fontSize:15,fontWeight:600}}>
                <span>TOTAL</span>
                <span style={{fontFamily:'Rajdhani',fontSize:22,color:'var(--dhl-yellow)'}}>{formatGBP(grandTotal)}</span>
              </div>
            </div>

            {/* Override */}
            <div style={{marginTop:14,padding:'12px 16px',background:'rgba(232,160,32,0.04)',border:'1px solid rgba(232,160,32,0.15)',borderRadius:3}}>
              <div style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'var(--accent)',marginBottom:10}}>PRICE OVERRIDE (OPTIONAL)</div>
              <div className="form-grid">
                <div className="field-group" style={{marginBottom:0}}>
                  <label className="field-label">Override Total (£)</label>
                  <input className="field-input" type="number" step="0.01" placeholder={grandTotal.toFixed(2)} value={overrideTotal} onChange={e=>setOverrideTotal(e.target.value)} />
                </div>
                <div className="field-group" style={{marginBottom:0}}>
                  <label className="field-label">Reason (required for override)</label>
                  <input className="field-input" placeholder="e.g. Volume discount agreed" value={overrideReason} onChange={e=>setOverrideReason(e.target.value)} />
                </div>
              </div>
              {overrideTotal && <div style={{marginTop:8,fontSize:12,color:'var(--text-2)'}}>⚠ Override will be recorded in the audit log</div>}
            </div>
          </>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={step===1?onClose:()=>setStep(1)}>{step===1?'Cancel':'← Back'}</button>
          {step===1 && <button className="btn btn-danger" disabled={selectedIds.length===0||loadingStock} onClick={calcLines}>Review Charges →</button>}
          {step===2 && <>
            <button className="btn btn-ghost" disabled={saving} onClick={()=>handleCreate(true)}>{saving?'Saving…':'Save Draft'}</button>
            <button className="btn btn-danger" disabled={saving} onClick={()=>handleCreate(false)}>{saving?'Creating…':'Create & Send Invoice'}</button>
          </>}
        </div>
      </div>
    </div>
  )
}

// ─── INVOICE DETAIL MODAL ─────────────────────────────────────────────────────
function InvoiceDetailModal({ invoice, onClose, isLimited }) {
  const { user } = useAuth()
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('invoice_lines').select('*, stock(jade_reference,job_number,product,pallet_amount,carton_amount,is_split,split_type)').eq('invoice_id', invoice.id).then(({data}) => { setLines(data||[]); setLoading(false) })
  }, [invoice.id])

  async function toggleApproval(line) {
    const newVal = !line.china_approved
    await supabase.from('invoice_lines').update({ china_approved:newVal, china_approved_by:user?.id, china_approved_at:new Date().toISOString() }).eq('id', line.id)
    await logAction(user?.id, ACTIONS.CHINA_APPROVED, invoice.invoice_number, `Line ${line.stock?.jade_reference} ${newVal?'approved':'unapproved'}`)
    setLines(prev => prev.map(l => l.id===line.id ? {...l,china_approved:newVal} : l))
    toast.success(newVal ? 'Line approved' : 'Approval removed')
  }

  const displayTotal = invoice.override_total || invoice.total_amount

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div className="modal-title">{invoice.invoice_number}</div>
              <HawbBadge number={invoice.hawb_number}/>
            </div>
            <div style={{fontSize:12,color:'var(--text-2)',marginTop:4,display:'flex',gap:8,alignItems:'center'}}>
              <Tag billing={invoice.billing}/>
              <Tag status={invoice.status}/>
              <span>{format(new Date(invoice.invoice_date),'dd MMM yyyy')}</span>
            </div>
          </div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{padding:24,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
          ) : (
            <>
              <div className="table-wrap" style={{marginBottom:20}}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Job No.</th><th>JADE Ref</th><th>Product</th><th>Type</th>
                      <th>Days</th><th>Storage</th><th>Hdl In</th><th>Hdl Out</th>
                      <th>Delivery</th><th>Packing</th><th>Line Total</th>
                      {isLimited && <th>✓ Approved</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.id}>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)'}}>{l.stock?.job_number}</td>
                        <td className="bold mono-sm">{l.stock?.jade_reference}</td>
                        <td>{l.stock?.product}</td>
                        <td><span className={`tag ${l.stock?.is_split&&l.stock?.split_type==='carton'?'tag-blue':'tag-green'}`} style={{fontSize:10}}>{l.stock?.is_split?`SPLIT·${l.stock.split_type?.toUpperCase()}`:'STD'}</span></td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{l.chargeable_days}d</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:l.storage_charge===0?'var(--green)':'var(--text-0)'}}>{formatGBP(l.storage_charge)}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:l.handling_in_charge===0?'var(--green)':'var(--text-0)'}}>{formatGBP(l.handling_in_charge)}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{formatGBP(l.handling_out_charge)}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{formatGBP(l.delivery_charge)}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{formatGBP(l.packing_charge)}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>{formatGBP(l.line_total)}</td>
                        {isLimited && <td><input type="checkbox" checked={l.china_approved||false} onChange={()=>toggleApproval(l)} style={{width:14,height:14,accentColor:'var(--green)',cursor:'pointer'}} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{maxWidth:320,marginLeft:'auto',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,padding:'14px 16px'}}>
                {[['Storage',invoice.total_storage],['Handling In',invoice.total_handling_in],['Handling Out',invoice.total_handling_out],['Delivery',invoice.total_delivery],['Packing',invoice.total_packing]].map(([label,val])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                    <span style={{color:'var(--text-1)'}}>{label}</span>
                    <span style={{fontFamily:'JetBrains Mono',color:val===0?'var(--text-3)':'var(--text-0)'}}>{formatGBP(val||0)}</span>
                  </div>
                ))}
                {invoice.override_total && (
                  <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                    <span style={{color:'var(--accent)'}}>Override applied</span>
                    <span style={{fontFamily:'JetBrains Mono',color:'var(--text-3)',textDecoration:'line-through'}}>{formatGBP(invoice.total_amount)}</span>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 4px',fontSize:15,fontWeight:600}}>
                  <span>TOTAL</span>
                  <span style={{fontFamily:'Rajdhani',fontSize:22,color:'var(--dhl-yellow)'}}>{formatGBP(displayTotal)}</span>
                </div>
              </div>

              {invoice.override_reason && (
                <div style={{marginTop:12,padding:'8px 12px',background:'rgba(232,160,32,0.06)',border:'1px solid rgba(232,160,32,0.2)',borderRadius:3,fontSize:12,color:'var(--text-2)'}}>
                  <span style={{color:'var(--accent)'}}>Override reason: </span>{invoice.override_reason}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-ghost" onClick={()=>toast.success('PDF download coming soon')}>⬇ Download PDF</button>
          {!isLimited && <button className="btn btn-accent" onClick={()=>toast.success('Email resend coming soon')}>📧 Resend Email</button>}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN INVOICES PAGE ───────────────────────────────────────────────────────
export default function InvoicesPage() {
  const { isReadOnly, isLimited } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterBilling, setFilterBilling] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [totals, setTotals] = useState({ total:0, china:0, uk:0, awaiting:0, hawb:0 })

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('invoices').select('*').order('created_at',{ascending:false})
    if (filterBilling!=='all') q=q.eq('billing',filterBilling)
    if (filterStatus!=='all') q=q.eq('status',filterStatus)
    const [{data},{count:hawbCount}] = await Promise.all([
      q,
      supabase.from('hawb_numbers').select('*',{count:'exact',head:true}).eq('status','available'),
    ])
    const all = data||[]
    setInvoices(all)
    setTotals({
      total: all.reduce((s,i)=>s+(i.override_total||i.total_amount||0),0),
      china: all.filter(i=>i.billing==='china').reduce((s,i)=>s+(i.override_total||i.total_amount||0),0),
      uk: all.filter(i=>i.billing==='uk').reduce((s,i)=>s+(i.override_total||i.total_amount||0),0),
      awaiting: all.filter(i=>i.status==='draft').length,
      hawb: hawbCount||0,
    })
    setLoading(false)
  }, [filterBilling,filterStatus])

  useEffect(()=>{loadInvoices()},[loadInvoices])

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Invoicing</div>
          <div className="page-subtitle">{invoices.length} INVOICES</div>
        </div>
        {!isReadOnly && <button className="btn btn-danger" onClick={()=>setShowCreate(true)}>+ Create Invoice</button>}
      </div>

      {/* SUMMARY */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:14,marginBottom:20}}>
        {[
          {label:'Total Invoiced', val:formatGBP(totals.total), color:'var(--dhl-yellow)'},
          {label:'China Billing',  val:formatGBP(totals.china),  color:'var(--red)'},
          {label:'UK Billing',     val:formatGBP(totals.uk),     color:'var(--blue)'},
          {label:'Drafts',         val:totals.awaiting,           color:'var(--accent)'},
          {label:'HAWB Available', val:totals.hawb,               color:'var(--green)'},
        ].map(k=>(
          <div key={k.label} style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:4,padding:'14px 18px'}}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{k.label}</div>
            <div style={{fontFamily:'Rajdhani',fontSize:22,fontWeight:700,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <select className="filter-select" value={filterBilling} onChange={e=>setFilterBilling(e.target.value)}>
          <option value="all">All Billing</option>
          <option value="china">China</option>
          <option value="uk">UK</option>
        </select>
        <select className="filter-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="approved">Approved</option>
        </select>
        <div style={{flex:1}}/>
        <span style={{fontSize:12,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{invoices.length} invoices</span>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
        ) : invoices.length===0 ? (
          <div style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:12}}>📄</div>
            <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No invoices yet</div>
            <div style={{fontSize:13,color:'var(--text-2)'}}>Click "+ Create Invoice" to raise your first invoice</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice No.</th><th>HAWB</th><th>Date</th>
                <th>Storage</th><th>Hdl In</th><th>Hdl Out</th><th>Delivery</th><th>Packing</th>
                <th>Total</th><th>Billing</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv=>{
                const displayTotal = inv.override_total || inv.total_amount
                return (
                  <tr key={inv.id} className="clickable" onClick={()=>setDetailInvoice(inv)}>
                    <td className="bold mono-sm">{inv.invoice_number}</td>
                    <td><HawbBadge number={inv.hawb_number}/></td>
                    <td className="mono-sm">{format(new Date(inv.invoice_date),'dd/MM/yy')}</td>
                    <td className="mono-sm">{formatGBP(inv.total_storage||0)}</td>
                    <td className="mono-sm">{formatGBP(inv.total_handling_in||0)}</td>
                    <td className="mono-sm">{formatGBP(inv.total_handling_out||0)}</td>
                    <td className="mono-sm">{formatGBP(inv.total_delivery||0)}</td>
                    <td className="mono-sm">{formatGBP(inv.total_packing||0)}</td>
                    <td className="bold">{formatGBP(displayTotal||0)}{inv.override_total&&<span style={{marginLeft:6,fontSize:10,color:'var(--accent)'}}>OVR</span>}</td>
                    <td><Tag billing={inv.billing}/></td>
                    <td><Tag status={inv.status}/></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" onClick={()=>toast.success('PDF download coming soon')}>PDF</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateInvoiceModal onClose={()=>setShowCreate(false)} onSaved={loadInvoices}/>}
      {detailInvoice && <InvoiceDetailModal invoice={detailInvoice} onClose={()=>setDetailInvoice(null)} isLimited={isLimited}/>}
    </div>
  )
}
