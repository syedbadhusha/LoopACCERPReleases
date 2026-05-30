import React, { useEffect, useState } from 'react';
import POSScreen, { POSScreenProps } from './POSScreen';

interface POSViewFormProps {
  voucherId: string;
  onClose: () => void;
  autoPrint?: boolean;
}

export default function POSViewForm({ voucherId, onClose, autoPrint }: POSViewFormProps) {
  const [voucher, setVoucher] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVoucher() {
      setLoading(true);
      try {
        const res = await fetch(`/api/vouchers/${voucherId}`);
        const json = await res.json();
        setVoucher(json.data);
      } catch {
        setVoucher(null);
      } finally {
        setLoading(false);
      }
    }
    fetchVoucher();
  }, [voucherId]);

  if (loading) return null;
  if (!voucher) return <div>Voucher not found</div>;

  // If POS and optional, allow edit/settle
  const isHeldPOS = voucher.is_pos && voucher.optional;

  const posScreenProps: POSScreenProps = {
    voucherId,
    viewOnly: !isHeldPOS,
    isEditMode: isHeldPOS,
    onClose,
    hideSidebar: true,
    autoPrint,
  };
  return <POSScreen {...posScreenProps} />;
}
