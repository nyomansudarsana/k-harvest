import Select from 'react-select'

const customStyles = {
  control: (base, state) => ({
    ...base,
    borderRadius: 8,
    borderColor: state.isFocused ? '#2e86c1' : '#d1d9e0',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(46,134,193,0.15)' : 'none',
    fontSize: '0.875rem',
    minHeight: 38,
    '&:hover': { borderColor: '#2e86c1' },
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  menu: (base) => ({ ...base, zIndex: 9999, fontSize: '0.875rem', borderRadius: 8 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#1a5276' : state.isFocused ? '#e8f4fd' : 'white',
    color: state.isSelected ? 'white' : '#333',
  }),
}

export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Select...', isLoading, isClearable = true, isDisabled, name }) {
  const selected = options.find(o => o.value === value) || null
  return (
    <Select
      name={name}
      options={options}
      value={selected}
      onChange={(opt) => onChange(opt ? opt.value : null, opt)}
      placeholder={placeholder}
      isLoading={isLoading}
      isClearable={isClearable}
      isDisabled={isDisabled}
      styles={customStyles}
      menuPortalTarget={document.body}
      menuPosition="fixed"
    />
  )
}
