import SalesForm from './SalesForm';

// Credit Note Form - Uses SalesForm with credit-note type
const CreditNoteForm = () => {
  // The SalesForm will detect voucher_type from the path/context
  // We'll pass it via a context variable or modify the form to accept props
  return <SalesForm voucherType="credit-note" />;
};

export default CreditNoteForm;
