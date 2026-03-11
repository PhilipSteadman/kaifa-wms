/**
 * Kaifa WMS — Charge Calculation Helpers
 * All billing logic lives here so it stays consistent across
 * the invoice builder, charge previews, and the China report.
 */

// Default rates (overridden by values from charge_rates table in Supabase)
export const DEFAULT_RATES = {
  storage_per_pallet_per_day: 0.69,
  storage_free_days: 14,
  handling_in_per_pallet: 5.48,
  handling_out_per_pallet: 2.50,
  handling_out_per_carton_split: 0.50,
  packing_per_carton: 0.50,
  delivery_per_pallet: 60.00,
}

/**
 * Calculate charges for a stock line being added to an invoice.
 *
 * @param {object} stockLine - The stock record
 * @param {Date}   deliveryDate - When the goods are being delivered
 * @param {number} addressCap - Max delivery charge for the delivery address (£)
 * @param {object} rates - Rate overrides from charge_rates table
 * @returns {object} Charge breakdown
 */
export function calculateCharges(stockLine, deliveryDate, addressCap, rates = DEFAULT_RATES) {
  const r = { ...DEFAULT_RATES, ...rates }

  const receiveDate = new Date(stockLine.receive_date)
  const deliver = new Date(deliveryDate)
  const daysStored = Math.max(0, Math.floor((deliver - receiveDate) / (1000 * 60 * 60 * 24)))
  const chargeableDays = Math.max(0, daysStored - r.storage_free_days)

  let storageCharge = 0
  let handlingInCharge = 0
  let handlingOutCharge = 0
  let deliveryCharge = 0
  let packingCharge = 0

  if (stockLine.is_split && stockLine.split_type === 'carton') {
    // Carton split: no storage, no handling in
    // Handling out and packing per carton only
    handlingOutCharge = (stockLine.carton_amount || 0) * r.handling_out_per_carton_split
    packingCharge = (stockLine.carton_amount || 0) * r.packing_per_carton
    deliveryCharge = Math.min((stockLine.pallet_amount || 0) * r.delivery_per_pallet, addressCap || Infinity)
  } else {
    // Standard line or pallet split: full charges
    const pallets = stockLine.pallet_amount || 0
    const cartons = stockLine.carton_amount || 0
    storageCharge = chargeableDays * pallets * r.storage_per_pallet_per_day
    handlingInCharge = pallets * r.handling_in_per_pallet
    handlingOutCharge = pallets * r.handling_out_per_pallet
    packingCharge = cartons * r.packing_per_carton
    deliveryCharge = Math.min(pallets * r.delivery_per_pallet, addressCap || Infinity)
  }

  const lineTotal = storageCharge + handlingInCharge + handlingOutCharge + deliveryCharge + packingCharge

  return {
    days_stored: daysStored,
    chargeable_days: chargeableDays,
    storage_charge: round2(storageCharge),
    handling_in_charge: round2(handlingInCharge),
    handling_out_charge: round2(handlingOutCharge),
    delivery_charge: round2(deliveryCharge),
    packing_charge: round2(packingCharge),
    line_total: round2(lineTotal),
  }
}

/**
 * Apply a delivery address cap across multiple lines going to the same address.
 * The cap applies to the combined delivery total for that address, not per line.
 */
export function applyAddressCap(lines, addressCap) {
  const totalDelivery = lines.reduce((sum, l) => sum + l.delivery_charge, 0)
  if (addressCap && totalDelivery > addressCap) {
    const ratio = addressCap / totalDelivery
    return lines.map(l => ({
      ...l,
      delivery_charge: round2(l.delivery_charge * ratio),
      line_total: round2(
        l.storage_charge + l.handling_in_charge + l.handling_out_charge +
        round2(l.delivery_charge * ratio) + l.packing_charge
      )
    }))
  }
  return lines
}

function round2(n) {
  return Math.round(n * 100) / 100
}

export function formatGBP(amount) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}
