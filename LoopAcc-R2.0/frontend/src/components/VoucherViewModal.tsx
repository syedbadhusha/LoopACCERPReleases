import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function VoucherViewModal({ open, onOpenChange, children }: { open: boolean, onOpenChange: (v: boolean) => void, children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] p-0 bg-white overflow-y-auto">
        <DialogTitle className="sr-only">Voucher View</DialogTitle>
        <DialogDescription className="sr-only">Voucher details in view-only mode</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
