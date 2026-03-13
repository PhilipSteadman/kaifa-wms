import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const ACCEPTED = ['application/pdf','image/jpeg','image/png','image/webp','image/tiff']
const MAX_MB = 10

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1024/1024).toFixed(1)} MB`
}

function FileIcon({ mime }) {
  if (mime === 'application/pdf') return <span style={{fontSize:20}}>📄</span>
  if (mime?.startsWith('image/')) return <span style={{fontSize:20}}>🖼️</span>
  return <span style={{fontSize:20}}>📎</span>
}

export default function PodUploader({ stockId, stockRef, isReadOnly }) {
  const { user, profile } = useAuth()
  const [pods, setPods] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewName, setPreviewName] = useState('')
  const fileInputRef = useRef()
  const isAdmin = profile?.role === 'admin'
  const canUpload = !isReadOnly && profile?.role !== 'limited'

  async function loadPods() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pod_documents')
      .select('*, profiles(display_name)')
      .eq('stock_id', stockId)
      .order('created_at', { ascending: false })
    if (!error) setPods(data || [])
    setLoading(false)
  }

  useEffect(() => { if (stockId) loadPods() }, [stockId])

  async function uploadFiles(files) {
    const valid = Array.from(files).filter(f => {
      if (!ACCEPTED.includes(f.type)) {
        toast.error(`${f.name}: unsupported file type. Use PDF or image files.`)
        return false
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        toast.error(`${f.name}: file too large (max ${MAX_MB}MB)`)
        return false
      }
      return true
    })
    if (!valid.length) return

    setUploading(true)
    for (const file of valid) {
      const ext = file.name.split('.').pop()
      const path = `pods/${stockId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      setUploadProgress(p => ({ ...p, [file.name]: 0 }))

      const { error: upErr } = await supabase.storage
        .from('pod-documents')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (upErr) {
        toast.error(`Failed to upload ${file.name}: ${upErr.message}`)
        setUploadProgress(p => { const n = { ...p }; delete n[file.name]; return n })
        continue
      }

      const { error: dbErr } = await supabase.from('pod_documents').insert({
        stock_id: stockId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user?.id,
      })

      if (dbErr) {
        toast.error(`Uploaded but failed to save record: ${dbErr.message}`)
      } else {
        await logAction(user?.id, ACTIONS.STOCK_UPDATED, stockRef, `POD uploaded: ${file.name}`)
        toast.success(`${file.name} uploaded`)
      }
      setUploadProgress(p => { const n = { ...p }; delete n[file.name]; return n })
    }
    setUploading(false)
    loadPods()
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (!canUpload) return
    uploadFiles(e.dataTransfer.files)
  }

  function onDragOver(e) {
    e.preventDefault()
    if (canUpload) setDragOver(true)
  }

  async function handleDownload(pod) {
    const { data, error } = await supabase.storage
      .from('pod-documents')
      .createSignedUrl(pod.file_path, 60)
    if (error) { toast.error('Could not generate download link'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function handlePreview(pod) {
    const { data, error } = await supabase.storage
      .from('pod-documents')
      .createSignedUrl(pod.file_path, 300)
    if (error) { toast.error('Could not open preview'); return }
    setPreviewUrl(data.signedUrl)
    setPreviewName(pod.file_name)
  }

  async function handleDelete(pod) {
    if (!window.confirm(`Delete "${pod.file_name}"? This cannot be undone.`)) return
    const { error: stErr } = await supabase.storage.from('pod-documents').remove([pod.file_path])
    if (stErr) { toast.error('Failed to delete file from storage'); return }
    const { error: dbErr } = await supabase.from('pod_documents').delete().eq('id', pod.id)
    if (dbErr) { toast.error('Failed to delete record'); return }
    await logAction(user?.id, ACTIONS.STOCK_UPDATED, stockRef, `POD deleted: ${pod.file_name}`)
    toast.success('POD deleted')
    loadPods()
  }

  const pendingFiles = Object.keys(uploadProgress)

  return (
    <div>
      {/* HEADER */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <div style={{fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-2)'}}>
          POD DOCUMENTS
          {pods.length > 0 && <span style={{marginLeft:8,background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:10,padding:'1px 7px',color:'var(--accent)'}}>{pods.length}</span>}
        </div>
        {canUpload && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            + Add File
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        style={{display:'none'}}
        onChange={e => uploadFiles(e.target.files)}
      />

      {/* DROP ZONE */}
      {canUpload && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--dhl-red)' : 'var(--border)'}`,
            borderRadius: 4,
            padding: '20px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(204,0,0,0.04)' : 'var(--bg-3)',
            transition: 'all 0.15s',
            marginBottom: pods.length > 0 || pendingFiles.length > 0 ? 14 : 0,
          }}
        >
          <div style={{fontSize:28,marginBottom:6}}>📂</div>
          <div style={{fontSize:13,color:'var(--text-1)',fontWeight:500}}>
            {dragOver ? 'Drop to upload' : 'Drag & drop POD files here'}
          </div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>
            PDF, JPG, PNG, WebP · Max {MAX_MB}MB per file
          </div>
        </div>
      )}

      {/* UPLOAD PROGRESS */}
      {pendingFiles.map(name => (
        <div key={name} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'rgba(48,144,232,0.06)',border:'1px solid rgba(48,144,232,0.2)',borderRadius:3,marginBottom:6}}>
          <div style={{width:16,height:16,border:'2px solid var(--blue)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}}/>
          <span style={{fontSize:13,color:'var(--text-1)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</span>
          <span style={{fontSize:11,color:'var(--blue)',fontFamily:'JetBrains Mono'}}>Uploading…</span>
        </div>
      ))}

      {/* FILE LIST */}
      {loading ? (
        <div style={{padding:'12px 0',textAlign:'center',color:'var(--text-3)',fontFamily:'JetBrains Mono',fontSize:12}}>Loading…</div>
      ) : pods.length === 0 && pendingFiles.length === 0 ? (
        !canUpload && <div style={{padding:'10px 0',fontSize:12,color:'var(--text-3)',textAlign:'center'}}>No POD documents attached</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {pods.map(pod => (
            <div key={pod.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,transition:'border-color 0.1s'}}
              onMouseOver={e=>e.currentTarget.style.borderColor='var(--border-bright)'}
              onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}
            >
              <FileIcon mime={pod.mime_type}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:'var(--text-0)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pod.file_name}</div>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:1,fontFamily:'JetBrains Mono'}}>
                  {formatSize(pod.file_size)} · {pod.created_at ? format(new Date(pod.created_at),'dd/MM/yy HH:mm') : '—'} · {pod.profiles?.display_name || 'Unknown'}
                </div>
              </div>
              <div style={{display:'flex',gap:4,flexShrink:0}}>
                {pod.mime_type?.startsWith('image/') && (
                  <button className="btn btn-sm btn-ghost" onClick={()=>handlePreview(pod)} title="Preview">👁</button>
                )}
                {pod.mime_type === 'application/pdf' && (
                  <button className="btn btn-sm btn-ghost" onClick={()=>handlePreview(pod)} title="Open PDF">👁</button>
                )}
                <button className="btn btn-sm btn-secondary" onClick={()=>handleDownload(pod)} title="Download">⬇</button>
                {isAdmin && (
                  <button className="btn btn-sm btn-ghost" onClick={()=>handleDelete(pod)} title="Delete" style={{color:'var(--red)'}}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewUrl && (
        <div className="modal-overlay" onClick={()=>{setPreviewUrl(null);setPreviewName('')}}>
          <div style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:6,padding:0,maxWidth:'90vw',maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:14,fontWeight:500,color:'var(--text-0)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:400}}>{previewName}</div>
              <div style={{display:'flex',gap:8}}>
                <a href={previewUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary">⬇ Download</a>
                <button className="btn btn-sm btn-ghost" onClick={()=>{setPreviewUrl(null);setPreviewName('')}}>✕ Close</button>
              </div>
            </div>
            <div style={{flex:1,overflow:'auto',padding:16,display:'flex',alignItems:'center',justifyContent:'center',minHeight:400}}>
              {previewName.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewUrl} style={{width:'75vw',height:'75vh',border:'none',borderRadius:3}} title={previewName}/>
              ) : (
                <img src={previewUrl} alt={previewName} style={{maxWidth:'80vw',maxHeight:'75vh',objectFit:'contain',borderRadius:3}}/>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
