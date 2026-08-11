// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { ReplayBar } from "@/domains/trainer/trainerTypes";
import { useState } from 'react';
import type { SessionSnapshot } from '@/domains/training/types';

type TrainerInstrumentSummary = {
  id: string;
  symbol: string;
  baseTimeframe: BaseTimeframe;
  name: string | null;
  barCount: number;
  timeStartTs?: string | null;
  timeEndTs?: string | null;
  barsVersionToken?: string;
  scopeKind?: "SYSTEM" | "LOCAL";
  sourceId?: string | null;
  sourceName?: string | null;
  displayLabel?: string;
};

export const useTrainerSessionDataState = () => {
  const [instruments, setInstruments] = useState<TrainerInstrumentSummary[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
  const [bars, setBars] = useState<ReplayBar[]>([]);
  const [barsTimeZone, setBarsTimeZone] = useState<string | null>(null);
  const [barsOffset, setBarsOffset] = useState(0);
  const [barsTotal, setBarsTotal] = useState(0);
  const [sessionId, setSessionId] = useState('');
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [currentTrainingBaseTimeframe, setCurrentTrainingBaseTimeframe] = useState<BaseTimeframe>('1d');

  return {
    instruments,
    setInstruments,
    selectedSymbol,
    setSelectedSymbol,
    selectedInstrumentId,
    setSelectedInstrumentId,
    bars,
    setBars,
    barsTimeZone,
    setBarsTimeZone,
    barsOffset,
    setBarsOffset,
    barsTotal,
    setBarsTotal,
    sessionId,
    setSessionId,
    snapshot,
    setSnapshot,
    currentTrainingBaseTimeframe,
    setCurrentTrainingBaseTimeframe
  };
};
