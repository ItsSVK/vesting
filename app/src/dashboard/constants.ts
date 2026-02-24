import { BN } from '@coral-xyz/anchor';

export const TOKEN_DECIMALS = 6;
export const DECIMAL_MULTIPLIER = new BN(10).pow(new BN(TOKEN_DECIMALS));
export const ZERO = new BN(0);
