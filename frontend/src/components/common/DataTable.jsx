import { useState } from 'react'

export default function DataTable({ columns, data, loading, pagination, onPageChange, onSort, emptyText = 'No records found' }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (col) => {
    if (!col.sortable) return
    const newDir = sortCol === col.key && sortDir === 'asc' ? 'desc' : 'asc'
    setSortCol(col.key)
    setSortDir(newDir)
    onSort?.(col.key, newDir)
  }

  return (
    <div>
      <div className="kh-table-wrapper">
        <table className="kh-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  style={{ width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                >
                  {col.label}
                  {col.sortable && sortCol === col.key && (
                    <i className={`bi bi-caret-${sortDir === 'asc' ? 'up' : 'down'}-fill ms-1`} style={{ fontSize: '0.7rem' }} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-5">
                  <div className="spinner-border spinner-border-sm text-primary me-2" />
                  Loading...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-5 text-muted">
                  <i className="bi bi-inbox fs-3 d-block mb-2" />
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={row.id || i}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="d-flex align-items-center justify-content-between mt-3 px-1">
          <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
            Showing {((pagination.page - 1) * pagination.size) + 1}–{Math.min(pagination.page * pagination.size, pagination.total)} of {pagination.total}
          </div>
          <div className="kh-pagination">
            <button className="kh-page-btn" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
              <i className="bi bi-chevron-left" />
            </button>
            {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => {
              let p = i + 1
              if (pagination.pages > 7) {
                if (pagination.page <= 4) p = i + 1
                else if (pagination.page >= pagination.pages - 3) p = pagination.pages - 6 + i
                else p = pagination.page - 3 + i
              }
              return (
                <button key={p} className={`kh-page-btn${pagination.page === p ? ' active' : ''}`} onClick={() => onPageChange(p)}>{p}</button>
              )
            })}
            <button className="kh-page-btn" disabled={pagination.page >= pagination.pages} onClick={() => onPageChange(pagination.page + 1)}>
              <i className="bi bi-chevron-right" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
