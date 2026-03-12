import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import toast from 'react-hot-toast'

const fmt = (n) => `£${(n||0).toFixed(2)}`

export default function ChinaReportPage() {
  const [invoices, setInvoices] = useState([])
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(),'yyyy-MM'))

  const monthStart = startOfMonth(new Date(`${selectedMonth}-01`))
  const monthEnd   = endOfMonth(new Date(`${selectedMonth}-01`))

  const load = useCallback(async () => {
    setLoading(true)
    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('billing','china')
      .gte('invoice_date', format(monthStart,'yyyy-MM-dd'))
      .lte('invoice_date', format(monthEnd,'yyyy-MM-dd'))
      .order('invoice_date',{ascending:true})

    const invIds = (invData||[]).map(i=>i.id)
    let linesData = []
    if (invIds.length > 0) {
      const { data } = await supabase
        .from('invoice_lines')
        .select('*, stock(jade_reference,job_number,product,pallet_amount,carton_amount,is_split,split_type,receive_date), invoices(invoice_number,invoice_date,hawb_number)')
        .in('invoice_id', invIds)
      linesData = data||[]
    }

    setInvoices(invData||[])
    setLines(linesData)
    setLoading(false)
  }, [selectedMonth])

  useEffect(() => { load() }, [load])

  // Month picker — last 13 months
  const monthOptions = Array.from({length:13},(_,i)=>{
    const d = subMonths(new Date(), i)
    return { value: format(d,'yyyy-MM'), label: format(d,'MMMM yyyy') }
  })

  const totals = {
    storage:     invoices.reduce((s,i)=>s+(i.total_storage||0),0),
    handling_in: invoices.reduce((s,i)=>s+(i.total_handling_in||0),0),
    handling_out:invoices.reduce((s,i)=>s+(i.total_handling_out||0),0),
    delivery:    invoices.reduce((s,i)=>s+(i.total_delivery||0),0),
    packing:     invoices.reduce((s,i)=>s+(i.total_packing||0),0),
    total:       invoices.reduce((s,i)=>s+(i.override_total||i.total_amount||0),0),
  }
  const allApproved = lines.length > 0 && lines.every(l=>l.china_approved)
  const approvedCount = lines.filter(l=>l.china_approved).length

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">DHL China Monthly Report</div>
          <div className="page-subtitle">CHINA BILLING · {format(monthStart,'MMMM yyyy').toUpperCase()}</div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <select className="filter-select" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>
            {monthOptions.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={()=>toast.success('Excel export coming soon')}>⬇ Export Excel</button>
          <button className="btn btn-danger" onClick={()=>toast.success('Email to DHL China coming soon')}>📧 Email to DHL China</button>
        </div>
      </div>

      {/* APPROVAL STATUS */}
      <div style={{marginBottom:20,padding:'12px 16px',background:allApproved?'rgba(76,175,80,0.06)':'rgba(232,160,32,0.06)',border:`1px solid ${allApproved?'rgba(76,175,80,0.25)':'rgba(232,160,32,0.25)'}`,borderRadius:4,display:'flex',alignItems:'center',gap:12}}>
        <div style={{fontSize:20}}>{allApproved?'✅':'⏳'}</div>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-0)'}}>{allApproved?'All lines approved by DHL China':'Awaiting DHL China approval'}</div>
          <div style={{fontSize:12,color:'var(--text-2)',marginTop:2}}>{approvedCount} of {lines.length} lines approved · DHL China users can approve lines via the invoice detail view</div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:14,marginBottom:24}}>
        {[
          {l:'Invoices',    v:invoices.length,        c:'var(--text-0)'},
          {l:'Storage',     v:fmt(totals.storage),    c:'var(--blue)'},
          {l:'Handling In', v:fmt(totals.handling_in),c:'var(--blue)'},
          {l:'Handling Out',v:fmt(totals.handling_out),c:'var(--blue)'},
          {l:'Delivery',    v:fmt(totals.delivery),   c:'var(--blue)'},
          {l:'Packing',     v:fmt(totals.packing),    c:'var(--blue)'},
          {l:'TOTAL',       v:fmt(totals.total),      c:'var(--dhl-yellow)'},
        ].map(k=>(
          <div key={k.l} style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:4,padding:'14px 18px'}}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{k.l}</div>
            <div style={{fontFamily:'Rajdhani',fontSize:k.l==='TOTAL'?26:20,fontWeight:700,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
      ) : invoices.length === 0 ? (
        <div style={{padding:40,textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:12}}>📊</div>
          <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No China invoices for {format(monthStart,'MMMM yyyy')}</div>
          <div style={{fontSize:13,color:'var(--text-2)'}}>Select a different month or create China billing invoices</div>
        </div>
      ) : (
        <>
          {/* INVOICE SUMMARY TABLE */}
          <div style={{marginBottom:28}}>
            <div style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:600,color:'var(--text-0)',marginBottom:12}}>Invoice Summary</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Invoice No.</th><th>HAWB</th><th>Date</th><th>Storage</th><th>Hdl In</th><th>Hdl Out</th><th>Delivery</th><th>Packing</th><th>Total</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv=>{
                    const total = inv.override_total||inv.total_amount
                    return (
                      <tr key={inv.id}>
                        <td className="bold mono-sm">{inv.invoice_number}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)'}}>{inv.hawb_number||'—'}</td>
                        <td className="mono-sm">{format(new Date(inv.invoice_date),'dd/MM/yy')}</td>
                        <td className="mono-sm">{fmt(inv.total_storage)}</td>
                        <td className="mono-sm">{fmt(inv.total_handling_in)}</td>
                        <td className="mono-sm">{fmt(inv.total_handling_out)}</td>
                        <td className="mono-sm">{fmt(inv.total_delivery)}</td>
                        <td className="mono-sm">{fmt(inv.total_packing)}</td>
                        <td className="bold">{fmt(total)}{inv.override_total&&<span style={{marginLeft:4,fontSize:10,color:'var(--accent)'}}>OVR</span>}</td>
                        <td><span className={`tag ${inv.status==='approved'?'tag-green':inv.status==='sent'?'tag-blue':'tag-yellow'}`}>{inv.status?.toUpperCase()}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:'2px solid var(--border)'}}>
                    <td colSpan={3} style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--text-2)',fontWeight:600}}>TOTALS</td>
                    {[totals.storage,totals.handling_in,totals.handling_out,totals.delivery,totals.packing].map((v,i)=>(
                      <td key={i} style={{fontFamily:'Rajdhani',fontSize:14,fontWeight:700,color:'var(--text-0)'}}>{fmt(v)}</td>
                    ))}
                    <td style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--dhl-yellow)'}}>{fmt(totals.total)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* LINE DETAIL TABLE */}
          {lines.length > 0 && (
            <div>
              <div style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:600,color:'var(--text-0)',marginBottom:12}}>Line Detail</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Invoice</th><th>HAWB</th><th>Job No.</th><th>JADE Ref</th><th>Product</th><th>Type</th><th>Days</th><th>Storage</th><th>Hdl In</th><th>Hdl Out</th><th>Delivery</th><th>Packing</th><th>Line Total</th><th>✓</th></tr>
                  </thead>
                  <tbody>
                    {lines.map(l=>(
                      <tr key={l.id} style={l.china_approved?{background:'rgba(76,175,80,0.03)'}:{}}>
                        <td className="mono-sm">{l.invoices?.invoice_number}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)'}}>{l.invoices?.hawb_number||'—'}</td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',fontWeight:600}}>{l.stock?.job_number}</td>
                        <td className="bold mono-sm">{l.stock?.jade_reference}</td>
                        <td>{l.stock?.product}</td>
                        <td><span className={`tag ${l.stock?.is_split&&l.stock?.split_type==='carton'?'tag-blue':'tag-green'}`} style={{fontSize:10}}>{l.stock?.is_split?`SPLIT·${l.stock.split_type?.toUpperCase()}`:'STD'}</span></td>
                        <td style={{fontFamily:'JetBrains Mono',fontSize:11}}>{l.chargeable_days||'—'}d</td>
                        <td className="mono-sm">{fmt(l.storage_charge)}</td>
                        <td className="mono-sm">{fmt(l.handling_in_charge)}</td>
                        <td className="mono-sm">{fmt(l.handling_out_charge)}</td>
                        <td className="mono-sm">{fmt(l.delivery_charge)}</td>
                        <td className="mono-sm">{fmt(l.packing_charge)}</td>
                        <td className="bold">{fmt(l.line_total)}</td>
                        <td>{l.china_approved ? <span style={{color:'var(--green)',fontSize:16}}>✓</span> : <span style={{color:'var(--text-3)',fontSize:13}}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
