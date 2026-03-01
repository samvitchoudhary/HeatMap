/**
 * CardStackContext.tsx
 *
 * Global state for whether the CardStack modal is open.
 *
 * Key responsibilities:
 * - Tracks cardStackOpen so tabs/other UI can react (e.g. disable scroll, hide FAB)
 * - ProfileScreen and HomeScreen use setCardStackOpen when opening/closing the stack
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

type CardStackContextType = {
  cardStackOpen: boolean;
  setCardStackOpen: (open: boolean) => void;
};

const CardStackContext = createContext<CardStackContextType | null>(null);

/** Provider that exposes card stack open state to the tree */
export function CardStackProvider({ children }: { children: React.ReactNode }) {
  /** True when CardStack overlay is visible (viewing posts) */
  const [cardStackOpen, setCardStackOpen] = useState(false);
  const setOpen = useCallback((open: boolean) => setCardStackOpen(open), []);
  return (
    <CardStackContext.Provider value={{ cardStackOpen, setCardStackOpen: setOpen }}>
      {children}
    </CardStackContext.Provider>
  );
}

/** Hook - returns safe defaults when used outside provider */
export function useCardStack() {
  const ctx = useContext(CardStackContext);
  return ctx ?? { cardStackOpen: false, setCardStackOpen: () => {} };
}
