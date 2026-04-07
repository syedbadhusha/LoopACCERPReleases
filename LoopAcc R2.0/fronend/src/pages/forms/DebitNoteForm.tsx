import PurchaseForm from './PurchaseForm';

// Debit Note Form - Uses PurchaseForm with debit-note type
const DebitNoteForm = () => {
  // The PurchaseForm will detect voucher_type from the path/context
  // We'll pass it via a context variable or modify the form to accept props
  return <PurchaseForm voucherType="debit-note" />;
};

export default DebitNoteForm;
