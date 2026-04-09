type CompanyLike = {
  country?: string;
  tax_type?: string;
  settings?: Record<string, string | boolean | undefined>;
};

export const getCompanyTaxType = (company?: CompanyLike | null): string => {
  const explicitType = String(company?.tax_type || '').trim().toUpperCase();
  if (explicitType) return explicitType;

  const country = String(company?.country || '').trim().toLowerCase();
  return country === 'india' ? 'GST' : 'VAT';
};

export const isCompanyTaxEnabled = (company?: CompanyLike | null): boolean => {
  const settings = company?.settings || {};

  return (
    settings.enable_tax === 'true' ||
    settings.enable_tax === true ||
    settings.gst_applicable === 'true' ||
    settings.gst_applicable === true ||
    settings.vat_applicable === 'true' ||
    settings.vat_applicable === true
  );
};

export const getCompanyTaxLabel = (company?: CompanyLike | null): string => {
  const taxType = getCompanyTaxType(company);
  if (taxType === 'GST') return 'GST Amount';
  if (taxType === 'VAT') return 'VAT Amount';
  return 'Tax Amount';
};

/** Returns true when bill-wise (bill allocation) is enabled at the company level.
 *  Defaults to TRUE so existing companies without the setting keep working. */
export const isCompanyBillsEnabled = (company?: CompanyLike | null): boolean => {
  const v = company?.settings?.enable_bills;
  if (v === undefined || v === null || v === '') return true; // default on
  return v === 'true' || v === true;
};

/** Returns true when batch tracking is enabled at the company level.
 *  Defaults to TRUE so existing companies without the setting keep working. */
export const isCompanyBatchesEnabled = (company?: CompanyLike | null): boolean => {
  const v = company?.settings?.enable_batches;
  if (v === undefined || v === null || v === '') return true; // default on
  return v === 'true' || v === true;
};

/** Returns true when the POS module is enabled at the company level.
 *  Defaults to FALSE — must be explicitly enabled in Settings. */
export const isCompanyPOSEnabled = (company?: CompanyLike | null): boolean => {
  const v = company?.settings?.enable_pos;
  if (v === undefined || v === null || v === '') return false; // default off
  return v === 'true' || v === true;
};
