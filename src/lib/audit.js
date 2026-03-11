import { supabase } from './supabase'

export async function logAction(userId, action, reference = null, detail = null) {
  try {
    await supabase.from('audit_log').insert({
      user_id: userId,
      action,
      reference,
      detail,
    })
  } catch (err) {
    // Audit failures should not block the main action
    console.error('Audit log error:', err)
  }
}

// Action constants — keep these consistent across the app
export const ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  STOCK_ADDED: 'STOCK_ADDED',
  STOCK_UPDATED: 'STOCK_UPDATED',
  STOCK_SPLIT: 'STOCK_SPLIT',
  INVOICE_CREATED: 'INVOICE_CREATED',
  INVOICE_SENT: 'INVOICE_SENT',
  PRICE_OVERRIDE: 'PRICE_OVERRIDE',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  HAWB_IMPORTED: 'HAWB_IMPORTED',
  CHINA_APPROVED: 'CHINA_APPROVED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
}
