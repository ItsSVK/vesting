import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from './useWorkspace';
import { getMint } from '@solana/spl-token';

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
        
        const accounts = accountsRaw.filter((acc: any) => {
           return acc.account.grantor.toString() === userPubkey || 
                  acc.account.beneficiary.toString() === userPubkey;
        });

        // Hardcode known devnet mints for richer UI
        const KNOWN_MINTS: Record<string, { name: string, logo: string }> = {
           "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": {
              name: "USDC (Devnet)",
              logo: "src/assets/USDC-icon_128x128.png",
           },
           "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr": {
              name: "EURC (Devnet)",
              logo: "src/assets/EURC-icon_128x128.png",
           }
        };

        // Resolve decimals and metadata for each token mint
        const itemsWithDecimals = await Promise.all(
          accounts.map(async (acc: any) => {
            const mintStr = acc.account.tokenMint.toString();
            try {
              const mintInfo = await getMint(program.provider.connection, acc.account.tokenMint);
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
