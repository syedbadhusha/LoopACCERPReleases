import React from 'react';
import AccountingVchForms from './AccountingVchForms';

interface AccountingVchViewFormProps {
  voucherId: string;
  voucherTypeId: string;
  onClose: () => void;
  autoPrint?: boolean;
}

export default function AccountingVchViewForm({ voucherId, voucherTypeId, onClose, autoPrint }: AccountingVchViewFormProps) {
  return (
    <AccountingVchForms voucherId={voucherId} voucherTypeId={voucherTypeId} viewOnly onClose={onClose} hideSidebar autoPrint={autoPrint} />
  );
}
