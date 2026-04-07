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
