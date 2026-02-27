/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';
import { useVestingDashboard, type VestingDashboardController } from '../hooks/useVestingDashboard';

const VestingDashboardContext = createContext<VestingDashboardController | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const dashboard = useVestingDashboard();
  return (
    <VestingDashboardContext.Provider value={dashboard}>
      {children}
    </VestingDashboardContext.Provider>
  );
}

export function useVestingContext(): VestingDashboardController {
  const context = useContext(VestingDashboardContext);
  if (!context) {
    throw new Error('useVestingContext must be used inside <DashboardProvider>');
  }
  return context;
}
