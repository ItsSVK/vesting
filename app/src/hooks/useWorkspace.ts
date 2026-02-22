import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { useMemo } from 'react';
import idl from '../idl/capstone_vesting_vault.json';

// We map IDL type to support the local json
export const useWorkspace = () => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();

    const provider = useMemo(() => {
        if (!wallet) return null;
        return new AnchorProvider(
            connection,
            wallet,
            AnchorProvider.defaultOptions()
        );
    }, [connection, wallet]);

    const program = useMemo(() => {
        if (!provider) return null;
        return new Program(idl as Idl, provider);
    }, [provider]);

    return {
        connection,
        wallet,
        provider,
        program,
    };
};
