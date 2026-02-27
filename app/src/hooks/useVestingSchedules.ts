import { useQuery } from '@tanstack/react-query';
import type { PublicKey } from '@solana/web3.js';
import { useWorkspace } from './useWorkspace';
import { getMint } from '@solana/spl-token';
import UsdcLogo from '../assets/USDC-icon_128x128.png';
import EurcLogo from '../assets/EURC-icon_128x128.png';

export function useVestingSchedules() {
  const { program, wallet } = useWorkspace();

  return useQuery({
    queryKey: ['vestingSchedules', wallet?.publicKey?.toString()],
    queryFn: async () => {
      if (!program || !wallet) return [];

      try {
        // Fetch all vesting accounts where the user is either the grantor or beneficiary
        // @ts-expect-error - dynamic IDL parsing might not give perfect types
        const accountsRaw = await program.account.vestingState.all();
        
        // Filter those relevant to the connected wallet
        const userPubkey = wallet.publicKey.toString();
        
        const accounts = accountsRaw.filter((acc: { account: Record<string, unknown> }) => {
           return String(acc.account.grantor) === userPubkey || 
                  String(acc.account.beneficiary) === userPubkey;
        });

        // Hardcode known devnet mints for richer UI
        const KNOWN_MINTS: Record<string, { name: string, logo: string }> = {
           "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": {
              name: "USDC (Devnet)",
              logo: UsdcLogo,
           },
           "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr": {
              name: "EURC (Devnet)",
              logo: EurcLogo,
           }
        };

        // Resolve decimals and metadata for each token mint
        const itemsWithDecimals = await Promise.all(
          accounts.map(async (acc: { account: Record<string, unknown> }) => {
            const mintStr = String(acc.account.tokenMint);
            try {
              const mintInfo = await getMint(program.provider.connection, acc.account.tokenMint as PublicKey);
              acc.account.decimals = mintInfo.decimals;
            } catch (err) {
              console.error("Failed to fetch mint for", mintStr, err);
              acc.account.decimals = 9; // Fallback to 9
            }
            
            if (KNOWN_MINTS[mintStr]) {
              acc.account.mintName = KNOWN_MINTS[mintStr].name;
              acc.account.mintLogoUrl = KNOWN_MINTS[mintStr].logo;
            }
            
            return acc;
          })
        );

        return itemsWithDecimals;
      } catch (error) {
        console.error("Error fetching vesting schedules:", error);
        return [];
      }
    },
    enabled: !!program && !!wallet,
  });
}
