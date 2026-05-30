import React, { useEffect, useState } from 'react';
import InventoryVchForms from './InventoryVchForms';
import { API_BASE_URL } from '@/config/runtime';

interface InventoryVchViewFormProps {
  voucherId: string;
  voucherTypeId: string;
  voucherType?: 'sales' | 'credit-note' | 'purchase' | 'debit-note';
  onClose: () => void;
  autoPrint?: boolean;
}

export default function InventoryVchViewForm({ voucherId, voucherTypeId, voucherType, onClose, autoPrint }: InventoryVchViewFormProps) {
  const [voucherTypeMeta, setVoucherTypeMeta] = useState<any>(null);

  useEffect(() => {
    async function fetchVoucherTypeMeta() {
      if (!voucherTypeId) return;
      try {
        const resp = await fetch(`${API_BASE_URL}/voucher-types/${voucherTypeId}`);
        const json = await resp.json();
        setVoucherTypeMeta(json.data);
      } catch {
        setVoucherTypeMeta(null);
      }
    }
    fetchVoucherTypeMeta();
  }, [voucherTypeId]);

  // Always set voucherId for popup mode (InventoryVchForms expects it on window)
  (window as any).__copilot_voucherId = voucherId;
  // If voucherTypeMeta is not loaded, fallback to rendering with minimal meta (for view-only)
  if (!voucherTypeMeta && voucherTypeId) return null;
  return (
    <InventoryVchForms voucherTypeMeta={voucherTypeMeta || { id: voucherTypeId, name: voucherType }} voucherType={voucherType} viewOnly autoPrint={autoPrint} />
  );
}
