export const getCurrencySymbol = (currencyCode?: string): string => {
  switch (currencyCode) {
    case 'INR':
      return '₹';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return '₹'; // Default to INR
  }
};
