import CustomFilterDropdown from './CustomFilterDropdown';
export default function PaymentFields({
  value,
  onChange,
  prefix
}) {
  return <><label htmlFor={`${prefix}-method`}>Payment method</label><CustomFilterDropdown id={`${prefix}-method`} value={value.paymentMethod || 'UNSPECIFIED'} onChange={paymentMethod => onChange({
      ...value,
      paymentMethod
    })} allowClear={false} options={[{
      value: 'UNSPECIFIED',
      label: 'Unspecified'
    }, {
      value: 'CASH',
      label: 'Cash'
    }, {
      value: 'ONLINE',
      label: 'Online'
    }, {
      value: 'CARD',
      label: 'Card'
    }]} /><label htmlFor={`${prefix}-receipt`}>رقم الحافظة</label><input id={`${prefix}-receipt`} className="input-field" maxLength={100} value={value.receiptNumber || ''} onChange={e => onChange({
      ...value,
      receiptNumber: e.target.value
    })} /></>;
}
