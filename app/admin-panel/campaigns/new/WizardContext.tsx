"use client";
import React, { createContext, useContext, useState } from "react";

type WizardData = {
  client?: string;
  goal?: string;
  template?: string;
  assets?: File[];
  budget?: number;
  startDate?: string;
  endDate?: string;
};

type ContextType = {
  data: WizardData;
  setData: (d: Partial<WizardData>) => void;
};

const WizardContext = createContext<ContextType>({
  data: {},
  setData: () => {},
});

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [data, setWizardData] = useState<WizardData>({});
  function setData(d: Partial<WizardData>) {
    setWizardData((prev) => ({ ...prev, ...d }));
  }
  return (
    <WizardContext.Provider value={{ data, setData }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  return useContext(WizardContext);
}
