import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction, ACTIONS } from '../lib/audit'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const ROLES = [
  { value: 'admin',    label: 'Admin',       desc: 'Full access + user management' },
  { value: 'standard', label: 'Standard',    desc: 'Full operational access' },
  { value: 'limited',  label: 'Limited / DHL China', desc: 'Read-only + approval checkboxes' },
]
const RoleBadge = ({ role }) => {
  const colors = { admin:'tag-red', standard:'tag-blue', limited:'tag-green' }
  return <span className={`tag ${colors[role]||'tag-orange'}`}>{role?.toUpperCase()}</span>
}

// ─── INVITE / EDIT USER MODAL ─────────────────────────────────────────────────
function UserModal({ onClose, onSaved, editUser = null }) {
  const { user: currentUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    email: editUser?.email || '',
    display_name: editUser?.display_name || '',
    role: editUser?.role || 'standard',
  })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSave() {
    if (!editUser && !form.email) { toast.error('Email is required'); return }
    if (!form.display_name) { toast.error('Display name is required'); return }
    setSaving(true)

    if (editUser) {
      // Update existing user profile
      const { error } = await supabase.from('profiles').update({
        display_name: form.display_name,
        role: form.role,
      }).eq('id', editUser.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      await logAction(currentUser?.id, ACTIONS.USER_UPDATED, editUser.email, `Role changed to ${form.role}`)
      toast.success('User updated')
    } else {
      // Invite new user via Supabase Auth
      const { error } = await supabase.auth.admin.inviteUserByEmail(form.email, {
        data: { display_name: form.display_name, role: form.role }
      })
      if (error) {
        // Fallback: just create the profile record and instruct them to sign up
        toast.error('Could not send invite email — user may need to sign up manually at your app URL.')
        setSaving(false)
        return
      }
      await logAction(currentUser?.id, ACTIONS.USER_CREATED, form.email, `New ${form.role} user invited`)
      toast.success(`Invite sent to ${form.email}`)
    }

    setSaving(false)
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{editUser ? 'Edit User' : 'Invite New User'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!editUser && (
            <div className="field-group">
              <label className="field-label">Email Address *</label>
              <input className="field-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="user@example.com" />
            </div>
          )}
          {editUser && (
            <div style={{padding:'8px 12px',background:'var(--bg-3)',border:'1px solid var(--border)',borderRadius:3,marginBottom:16,fontSize:13,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{editUser.email}</div>
          )}
          <div className="field-group">
            <label className="field-label">Display Name *</label>
            <input className="field-input" value={form.display_name} onChange={e=>set('display_name',e.target.value)} placeholder="e.g. Philip Steadman" />
          </div>
          <div className="field-group">
            <label className="field-label">Role</label>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
              {ROLES.map(r => (
                <label key={r.value} onClick={()=>set('role',r.value)} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',border:`1px solid ${form.role===r.value?'var(--dhl-red)':'var(--border)'}`,borderRadius:3,cursor:'pointer',background:form.role===r.value?'rgba(204,0,0,0.04)':'var(--bg-3)',transition:'all 0.15s'}}>
                  <input type="radio" name="role" value={r.value} checked={form.role===r.value} onChange={()=>set('role',r.value)} style={{marginTop:2,accentColor:'var(--dhl-red)',flexShrink:0}} />
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--text-0)'}}>{r.label}</div>
                    <div style={{fontSize:11,color:'var(--text-2)',marginTop:1}}>{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {!editUser && (
            <div className="alert alert-info" style={{marginTop:8}}>
              An invitation email will be sent. The user can set their password via the link.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : editUser ? 'Save Changes' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DEACTIVATE CONFIRM MODAL ─────────────────────────────────────────────────
function DeactivateModal({ user: targetUser, onClose, onSaved }) {
  const { user: currentUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const isActive = targetUser.is_active !== false

  async function handleToggle() {
    setSaving(true)
    const newStatus = !isActive
    const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', targetUser.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    await logAction(currentUser?.id, ACTIONS.USER_UPDATED, targetUser.email, `User ${newStatus?'reactivated':'deactivated'}`)
    toast.success(`User ${newStatus ? 'reactivated' : 'deactivated'}`)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isActive ? 'Deactivate User' : 'Reactivate User'}</div>
          <button style={{background:'none',border:'none',color:'var(--text-2)',fontSize:20,cursor:'pointer'}} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{textAlign:'center',padding:'10px 0 20px'}}>
            <div style={{fontSize:40,marginBottom:12}}>{isActive ? '🔒' : '🔓'}</div>
            <div style={{fontSize:15,color:'var(--text-0)',marginBottom:8}}>
              {isActive ? 'Deactivate' : 'Reactivate'} <strong>{targetUser.display_name}</strong>?
            </div>
            <div style={{fontSize:13,color:'var(--text-2)'}}>
              {isActive
                ? 'This user will no longer be able to log in. All their data is preserved.'
                : 'This user will be able to log in again with their existing password.'}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className={`btn ${isActive?'btn-danger':'btn-accent'}`} disabled={saving} onClick={handleToggle}>
            {saving ? 'Saving…' : isActive ? 'Deactivate User' : 'Reactivate User'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN USERS PAGE ──────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: currentUser, profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [deactivateUser, setDeactivateUser] = useState(null)
  const [filterRole, setFilterRole] = useState('all')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (filterRole !== 'all') q = q.eq('role', filterRole)
    const { data, error } = await q
    if (error) toast.error('Failed to load users')
    else setUsers(data || [])
    setLoading(false)
  }, [filterRole])

  useEffect(() => { loadUsers() }, [loadUsers])

  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    return (
      <div className="fade-in" style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:16}}>
        <div style={{fontSize:48}}>🔒</div>
        <div style={{fontFamily:'Rajdhani',fontSize:22,color:'var(--text-0)'}}>Admin Access Required</div>
        <div style={{fontSize:14,color:'var(--text-2)'}}>Only administrators can manage users.</div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-subtitle">{users.length} USERS · {users.filter(u=>u.role==='admin').length} ADMIN · {users.filter(u=>u.is_active!==false).length} ACTIVE</div>
        </div>
        <button className="btn btn-danger" onClick={()=>setShowInvite(true)}>+ Invite User</button>
      </div>

      {/* ROLE SUMMARY CARDS */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:14,marginBottom:20}}>
        {[
          {label:'Admin',              val:users.filter(u=>u.role==='admin').length,    color:'var(--red)'},
          {label:'Standard',           val:users.filter(u=>u.role==='standard').length, color:'var(--blue)'},
          {label:'Limited / DHL China',val:users.filter(u=>u.role==='limited').length,  color:'var(--green)'},
          {label:'Inactive',           val:users.filter(u=>u.is_active===false).length, color:'var(--text-3)'},
        ].map(k=>(
          <div key={k.label} style={{background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:4,padding:'14px 18px'}}>
            <div style={{fontFamily:'JetBrains Mono',fontSize:9,letterSpacing:1.5,textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>{k.label}</div>
            <div style={{fontFamily:'Rajdhani',fontSize:28,fontWeight:700,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <select className="filter-select" value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="standard">Standard</option>
          <option value="limited">Limited</option>
        </select>
        <div style={{flex:1}}/>
        <span style={{fontSize:12,color:'var(--text-2)',fontFamily:'JetBrains Mono'}}>{users.length} users</span>
      </div>

      <div className="table-wrap">
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-2)',fontFamily:'JetBrains Mono',fontSize:13}}>Loading…</div>
        ) : users.length === 0 ? (
          <div style={{padding:40,textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:12}}>👥</div>
            <div style={{fontFamily:'Rajdhani',fontSize:18,color:'var(--text-0)',marginBottom:6}}>No users found</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUser?.id
                const isInactive = u.is_active === false
                return (
                  <tr key={u.id} style={isInactive?{opacity:0.5}:{}}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'var(--bg-3)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Rajdhani',fontWeight:700,fontSize:14,color:'var(--accent)',flexShrink:0}}>
                          {u.display_name?u.display_name[0].toUpperCase():'?'}
                        </div>
                        <div>
                          <div style={{fontWeight:600,fontSize:13,color:'var(--text-0)'}}>{u.display_name||'—'}{isSelf&&<span style={{marginLeft:6,fontSize:10,color:'var(--text-3)',fontFamily:'JetBrains Mono'}}>(you)</span>}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono-sm">{u.email||'—'}</td>
                    <td><RoleBadge role={u.role}/></td>
                    <td>
                      {isInactive
                        ? <span className="tag tag-orange">INACTIVE</span>
                        : <span className="tag tag-green">ACTIVE</span>}
                    </td>
                    <td className="mono-sm">{u.created_at ? format(new Date(u.created_at),'dd/MM/yy') : '—'}</td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-sm btn-secondary" onClick={()=>setEditUser(u)} disabled={isSelf&&u.role==='admin'}>Edit</button>
                        {!isSelf && (
                          <button className={`btn btn-sm ${isInactive?'btn-accent':'btn-ghost'}`} onClick={()=>setDeactivateUser(u)}>
                            {isInactive ? 'Reactivate' : 'Deactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && <UserModal onClose={()=>setShowInvite(false)} onSaved={loadUsers}/>}
      {editUser && <UserModal editUser={editUser} onClose={()=>setEditUser(null)} onSaved={loadUsers}/>}
      {deactivateUser && <DeactivateModal user={deactivateUser} onClose={()=>setDeactivateUser(null)} onSaved={loadUsers}/>}
    </div>
  )
}
