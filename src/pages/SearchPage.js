import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'

const Section = ({ title, count, children }) => (
  <div style={{marginBottom:28}}>
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
      <div style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:2,textTransform:'uppercase',color:'var(--text-2)'}}>{title}</div>
      <div style={{background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:10,padding:'1px 8px',fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)'}}>{count}</div>
    </div>
    {children}
  </div>
)

const Tag = ({ billing, status }) => {
  if (billing) return <span className={`tag ${billing==='china'?'tag-red':'tag-blue'}`}>{billing.toUpperCase()}</span>
  const map = { in_stock:{cls:'tag-green',l:'IN STOCK'}, part_despatched:{cls:'tag-yellow',l:'PART DESP.'}, despatched:{cls:'tag-blue',l:'DESPATCHED'}, invoiced:{cls:'tag-red',l:'INVOICED'}, draft:{cls:'tag-yellow',l:'DRAFT'}, sent:{cls:'tag-blue',l:'SENT'}, approved:{cls:'tag-green',l:'APPROVED'} }
  const m = map[status] || {cls:'tag-orange',l:status}
  return <span className={`tag ${m.cls}`}>{m.l}</span>
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSearch(e) {
    e && e.preventDefault()
    if (!query.trim() || query.trim().length < 2) { toast.error('Enter at least 2 characters'); return }
    setLoading(true)
    const q = query.trim()

    const [stockRes, invoiceRes] = await Promise.all([
      supabase.from('stock').select('*').or(`jade_reference.ilike.%${q}%,job_number.ilike.%${q}%,customer_po.ilike.%${q}%,product.ilike.%${q}%,warehouse_location.ilike.%${q}%,pallet_numbers.ilike.%${q}%,carton_numbers.ilike.%${q}%`).order('created_at',{ascending:false}).limit(30),
      supabase.from('invoices').select('*').or(`invoice_number.ilike.%${q}%,hawb_number.ilike.%${q}%`).order('created_at',{ascending:false}).limit(20),
    ])

    setResults({
      stock: stockRes.data || [],
      invoices: invoiceRes.data || [],
    })
    setLoading(false)
  }

  const totalResults = results ? results.stock.length + results.invoices.length : 0

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Search</div>
          <div className="page-subtitle">SEARCH ACROSS ALL RECORDS</div>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div style={{marginBottom:28}}>
        <form onSubmit={handleSearch} style={{display:'flex',gap:10}}>
          <input
            className="field-input"
            style={{flex:1,padding:'11px 16px',fontSize:15}}
            placeholder="Search by JADE ref, Job No., HAWB, Customer PO, product, location…"
            value={query}
            onChange={e=>setQuery(e.target.value)}
            autoFocus
          />
          <button className="btn btn-danger" type="submit" disabled={loading} style={{padding:'0 28px',fontSize:14}}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
        <div style={{marginTop:8,fontSize:12,color:'var(--text-3)'}}>
          Searches: JADE reference · Job number · HAWB · Customer PO · Product · Warehouse location · Pallet/carton numbers · Invoice number
        </div>
      </div>

      {/* RESULTS */}
      {results === null && !loading && (
        <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>🔍</div>
          <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-2)'}}>Enter a search term above</div>
        </div>
      )}

      {results !== null && !loading && totalResults === 0 && (
        <div style={{textAlign:'center',padding:'48px 0'}}>
          <div style={{fontSize:48,marginBottom:12}}>😶</div>
          <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No results for "{query}"</div>
          <div style={{fontSize:13,color:'var(--text-2)'}}>Try a shorter term or check the spelling</div>
        </div>
      )}

      {results !== null && totalResults > 0 && (
        <div>
          <div style={{marginBottom:20,fontSize:13,color:'var(--text-2)'}}>
            <span style={{color:'var(--text-0)',fontWeight:600}}>{totalResults}</span> result{totalResults!==1?'s':''} for <span style={{color:'var(--accent)',fontFamily:'JetBrains Mono'}}>"{query}"</span>
          </div>

          {/* STOCK RESULTS */}
          {results.stock.length > 0 && (
            <Section title="Stock / Inventory" count={results.stock.length}>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Job No.</th><th>JADE Ref</th><th>PO</th><th>Product</th><th>Pallets</th><th>Cartons</th><th>Received</th><th>Age</th><th>Location</th><th>Status</th><th>Billing</th></tr>
                  </thead>
                  <tbody>
                    {results.stock.map(s => {
                      const days = s.receive_date ? differenceInDays(new Date(), new Date(s.receive_date)) : null
                      const ageColor = days > 14 ? 'var(--red)' : days >= 10 ? 'var(--accent)' : 'var(--green)'
                      // Highlight matching text
                      const hl = (text) => {
                        if (!text) return '—'
                        const idx = text.toLowerCase().indexOf(query.toLowerCase())
                        if (idx === -1) return text
                        return <>{text.slice(0,idx)}<mark style={{background:'rgba(232,160,32,0.3)',color:'inherit',borderRadius:2}}>{text.slice(idx,idx+query.length)}</mark>{text.slice(idx+query.length)}</>
                      }
                      return (
                        <tr key={s.id}>
                          <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)',fontWeight:600}}>{hl(s.job_number)}</td>
                          <td className="bold mono-sm">{hl(s.jade_reference)}</td>
                          <td className="mono-sm">{hl(s.customer_po)||'—'}</td>
                          <td>{hl(s.product)}</td>
                          <td>{s.pallet_amount||'—'}</td>
                          <td>{s.carton_amount||'—'}</td>
                          <td className="mono-sm">{s.receive_date?format(new Date(s.receive_date),'dd/MM/yy'):'—'}</td>
                          <td>{days!==null&&<span style={{fontFamily:'JetBrains Mono',fontSize:11,color:ageColor}}>{days}d</span>}</td>
                          <td>{hl(s.warehouse_location)||'—'}</td>
                          <td><Tag status={s.status}/></td>
                          <td><Tag billing={s.billing}/></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* INVOICE RESULTS */}
          {results.invoices.length > 0 && (
            <Section title="Invoices" count={results.invoices.length}>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Invoice No.</th><th>HAWB</th><th>Date</th><th>Total</th><th>Billing</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {results.invoices.map(inv => {
                      const total = inv.override_total || inv.total_amount
                      const hl = (text) => {
                        if (!text) return '—'
                        const idx = text.toLowerCase().indexOf(query.toLowerCase())
                        if (idx === -1) return text
                        return <>{text.slice(0,idx)}<mark style={{background:'rgba(232,160,32,0.3)',color:'inherit',borderRadius:2}}>{text.slice(idx,idx+query.length)}</mark>{text.slice(idx+query.length)}</>
                      }
                      return (
                        <tr key={inv.id}>
                          <td className="bold mono-sm">{hl(inv.invoice_number)}</td>
                          <td style={{fontFamily:'JetBrains Mono',fontSize:11,color:'var(--accent)'}}>{hl(inv.hawb_number)||'—'}</td>
                          <td className="mono-sm">{inv.invoice_date?format(new Date(inv.invoice_date),'dd/MM/yy'):'—'}</td>
                          <td style={{fontFamily:'JetBrains Mono',fontSize:12,fontWeight:600}}>£{(total||0).toFixed(2)}</td>
                          <td><Tag billing={inv.billing}/></td>
                          <td><Tag status={inv.status}/></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
