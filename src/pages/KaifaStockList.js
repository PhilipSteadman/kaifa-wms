import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format, differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'

const DaysBadge = ({ receiveDate }) => {
  if (!receiveDate) return null
  const days = differenceInDays(new Date(), new Date(receiveDate))
  const color = days > 14 ? 'var(--red)' : days >= 10 ? 'var(--accent)' : 'var(--green)'
  const bg    = days > 14 ? 'rgba(232,64,64,0.1)' : days >= 10 ? 'rgba(232,160,32,0.1)' : 'rgba(76,175,80,0.1)'
  return <span style={{fontFamily:'JetBrains Mono',fontSize:11,color,background:bg,border:`1px solid ${color}33`,padding:'1px 6px',borderRadius:3}}>{days}d</span>
}

const Tag = ({ billing }) => (
  <span className={`tag ${billing==='china'?'tag-red':'tag-blue'}`}>{billing?.toUpperCase()}</span>
)

export default function KaifaStockList() {
  const [inStock, setInStock]       = useState([])
  const [awaiting, setAwaiting]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [inRes, awRes] = await Promise.all([
      supabase.from('stock').select('*').eq('status','in_stock').order('receive_date',{ascending:true}),
      supabase.from('stock').select('*, customers(name), delivery_addresses(label,city), branches(name)').in('status',['part_despatched']).not('delivery_date','is',null).order('delivery_date',{ascending:true}),
    ])
    if (inRes.error || awRes.error) toast.error('Failed to load stock list')
    setInStock(inRes.data||[])
    setAwaiting(awRes.data||[])
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const chinaCt  = [...inStock,...awaiting].filter(s=>s.billing==='china').length
  const ukCt     = [...inStock,...awaiting].filter(s=>s.billing==='uk').length
  const totalPal = [...inStock,...awaiting].reduce((s,r)=>s+(r.pallet_amount||0),0)

  async function handleEmailKaifa() {
    toast.success('Email to Kaifa coming soon — PDF will be generated and sent automatically')
  }

  const tableHead = (extra = false) => (
    <thead>
      <tr>
        <th>Job No.</th><th>JADE Ref</th><th>Cust PO</th><th>Product</th>
        <th>Pallets</th><th>Cartons</th><th>Received</th><th>Days</th>
        <th>Location</th><th>Billing</th>
        {extra && <><th>Delivery Date</th><th>Customer</th><th>Address</th><th>Branch</th><th>Booking Ref</th></>}
      </tr>
    </thead>
  )

  const stockRow = (s, extra = false) => (
    <tr key={s.id}>
      <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',fontWeight:600}}>{s.job_number}</td>
      <td className="bold mono-sm">{s.jade_reference}</td>
      <td className="mono-sm">{s.customer_po||'—'}</td>
      <td>{s.product}</td>
      <td>{s.pallet_amount||'—'}</td>
      <td>{s.carton_amount||'—'}</td>
      <td className="mono-sm">{s.receive_date?format(new Date(s.receive_date),'dd/MM/yy'):'—'}</td>
      <td><DaysBadge receiveDate={s.receive_date}/></td>
      <td>{s.warehouse_location||'—'}</td>
      <td><Tag billing={s.billing}/></td>
      {extra && <>
        <td className="mono-sm">{s.delivery_date?format(new Date(s.delivery_date),'dd/MM/yy'):'—'}</td>
        <td className="bold">{s.customers?.name||'—'}</td>
        <td style={{fontSize:12}}>{s.delivery_addresses?`${s.delivery_addresses.label}, ${s.delivery_addresses.city}`:'—'}</td>
        <td style={{fontSize:12}}>{s.branches?.name||'—'}</td>
        <td className="mono-sm">{s.booking_reference||'—'}</td>
      </>}
    </tr>
  )

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Kaifa Stock List</div>
          <div className="page-subtitle">
            LIVE WAREHOUSE SNAPSHOT · {lastRefresh ? `UPDATED ${format(lastRefresh,'HH:mm:ss')}` : 'LOADING…'}
          </div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn btn-secondary" onClick={load}>↻ Refresh</button>
          <button className="btn btn-ghost" onClick={()=>toast.success('PDF download coming soon')}>⬇ Download PDF</button>
          <button className="btn btn-danger" onClick={handleEmailKaifa}>📧 Email to Kaifa</button>
        </div>
      </div>

      {/* SUMMARY STRIP */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:14,marginBottom:24}}>
        {[
          {l:'In Stock',           v:inStock.length,      c:'var(--green)'},
          {l:'Awaiting Delivery',  v:awaiting.length,     c:'var(--accent)'},
          {l:'Total Pallets',      v:totalPal,             c:'var(--blue)'},
          {l:'China Billing',      v:chinaCt,              c:'var(--red)'},
          {l:'UK Billing',         v:ukCt,                 c:'var(--dhl-yellow)'},
        ].map(k=>(
          <div key={k.l} style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:4,padding:'14px 18px'}}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{k.l}</div>
            <div style={{fontFamily:'Rajdhani',fontSize:26,fontWeight:700,color:k.c}}>{k.v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
      ) : (
        <>
          {/* SECTION 1 — IN STOCK */}
          <div style={{marginBottom:32}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{fontFamily:'Rajdhani',fontSize:18,fontWeight:600,color:'var(--text-0)'}}>Section 1 — Items In Stock</div>
              <span style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--green)',background:'rgba(76,175,80,0.1)',border:'1px solid rgba(76,175,80,0.3)',padding:'2px 8px',borderRadius:3}}>{inStock.length} lines</span>
            </div>
            {inStock.length === 0 ? (
              <div className="alert alert-info">No items currently in stock.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  {tableHead(false)}
                  <tbody>{inStock.map(s=>stockRow(s,false))}</tbody>
                  <tfoot>
                    <tr style={{borderTop:'2px solid var(--border)'}}>
                      <td colSpan={4} style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--text-2)',fontWeight:600}}>TOTALS</td>
                      <td style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--text-0)'}}>{inStock.reduce((s,r)=>s+(r.pallet_amount||0),0)}</td>
                      <td style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--text-0)'}}>{inStock.reduce((s,r)=>s+(r.carton_amount||0),0)}</td>
                      <td colSpan={4}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 2 — AWAITING DELIVERY */}
          <div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{fontFamily:'Rajdhani',fontSize:18,fontWeight:600,color:'var(--text-0)'}}>Section 2 — Items Awaiting Delivery</div>
              <span style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',background:'rgba(232,160,32,0.1)',border:'1px solid rgba(232,160,32,0.3)',padding:'2px 8px',borderRadius:3}}>{awaiting.length} lines</span>
            </div>
            {awaiting.length === 0 ? (
              <div className="alert alert-info">No deliveries currently scheduled.</div>
            ) : (
              <div className="table-wrap" style={{overflowX:'auto'}}>
                <table className="data-table">
                  {tableHead(true)}
                  <tbody>{awaiting.map(s=>stockRow(s,true))}</tbody>
                  <tfoot>
                    <tr style={{borderTop:'2px solid var(--border)'}}>
                      <td colSpan={4} style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--text-2)',fontWeight:600}}>TOTALS</td>
                      <td style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--text-0)'}}>{awaiting.reduce((s,r)=>s+(r.pallet_amount||0),0)}</td>
                      <td style={{fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--text-0)'}}>{awaiting.reduce((s,r)=>s+(r.carton_amount||0),0)}</td>
                      <td colSpan={9}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
