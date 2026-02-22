import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from './useWorkspace';

export function useVestingSchedules() {
  const { program, wallet } = useWorkspace();

  return useQuery({
    queryKey: ['vestingSchedules', wallet?.publicKey?.toString()],
    queryFn: async () => {
      if (!program || !wallet) return [];

      try {
        // Fetch all vesting accounts where the user is either the grantor or beneficiary
        // @ts-expect-error - dynamic IDL parsing might not give perfect types
        const accounts = await program.account.vestingState.all();
        
        // Filter those relevant to the connected wallet
        const userPubkey = wallet.publicKey.toString();
        
        return accounts.filter((acc: any) => {
           return acc.account.grantor.toString() === userPubkey || 
                  acc.account.beneficiary.toString() === userPubkey;
        });
      } catch (error) {
        console.error("Error fetching vesting schedules:", error);
        return [];
      }
    },
    enabled: !!program && !!wallet,
  });
}
