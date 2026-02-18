import React, { createContext, useContext, useState, useCallback } from 'react';

type CardStackContextType = {
  cardStackOpen: boolean;
  setCardStackOpen: (open: boolean) => void;
};

const CardStackContext = createContext<CardStackContextType | null>(null);

export function CardStackProvider({ children }: { children: React.ReactNode }) {
  const [cardStackOpen, setCardStackOpen] = useState(false);
  const setOpen = useCallback((open: boolean) => setCardStackOpen(open), []);
  return (
    <CardStackContext.Provider value={{ cardStackOpen, setCardStackOpen: setOpen }}>
      {children}
    </CardStackContext.Provider>
  );
}

export function useCardStack() {
  const ctx = useContext(CardStackContext);
  return ctx ?? { cardStackOpen: false, setCardStackOpen: () => {} };
}
