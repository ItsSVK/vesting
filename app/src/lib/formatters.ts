import { BN } from '@coral-xyz/anchor';

export function formatTokenAmount(amount: BN, decimals: number = 6): string {
  // Convert BN to string, then divide by decimals
  const amtStr = amount.toString();
  
  // Pad with leading zeros if amount is very small
  const paddedStr = amtStr.padStart(decimals + 1, '0');
  
  // Insert decimal point
  const intPart = paddedStr.slice(0, -decimals);
  const fracPart = paddedStr.slice(-decimals);
  
  // Combine, parse as float to remove trailing zeros
  const num = parseFloat(`${intPart}.${fracPart}`);
  
  // Format with commas and up to 2 decimal places to keep it clean
  return num.toLocaleString(undefined, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 2 
  });
}

export function formatDate(unixTimestamp: BN): string {
  const date = new Date(unixTimestamp.toNumber() * 1000);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}
