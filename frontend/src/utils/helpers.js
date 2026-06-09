import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

export const formatNumber = (n, decimals = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export const formatCurrency = (n, currency = 'USD') =>
  `${currency} ${formatNumber(n)}`

export const formatDate = (d) => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}

export const formatDateTime = (d) => {
  if (!d) return '-'
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const statusBadgeClass = (status) => {
  const map = {
    Active: 'badge-active', Inactive: 'badge-inactive',
    Pending: 'badge-pending', Passed: 'badge-passed', Failed: 'badge-failed',
    Draft: 'badge-draft', Issued: 'badge-issued', Paid: 'badge-paid',
    Cancelled: 'badge-cancelled', 'Converted to Invoice': 'badge-converted',
  }
  return map[status] || 'badge-draft'
}

export const exportToExcel = (data, filename = 'export') => {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${filename}.xlsx`)
}

export const debounce = (fn, delay) => {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay) }
}
