// SPDX-License-Identifier: GPL-3.0-only

import { createContext, useContext, type ReactNode } from "react";

type AnchorNavigatorDialogContextValue = {
  requestClose?: () => void;
};

const AnchorNavigatorDialogContext =
  createContext<AnchorNavigatorDialogContextValue>({});

export const AnchorNavigatorDialogProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: AnchorNavigatorDialogContextValue;
}) => (
  <AnchorNavigatorDialogContext.Provider value={value}>
    {children}
  </AnchorNavigatorDialogContext.Provider>
);

export const useAnchorNavigatorDialog = () =>
  useContext(AnchorNavigatorDialogContext);
