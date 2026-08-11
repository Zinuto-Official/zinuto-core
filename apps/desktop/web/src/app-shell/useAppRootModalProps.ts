// SPDX-License-Identifier: GPL-3.0-only

import { useAppCsvMappingModalProps } from '@/app-shell/useAppCsvMappingModalProps';
import { useAppTrainerModalHostProps } from '@/app-shell/useAppTrainerModalHostProps';
import { useAppTrainingRecordNoteModalProps } from '@/app-shell/useAppTrainingRecordNoteModalProps';
import { useAppUtilityDialogsProps } from '@/app-shell/useAppUtilityDialogsProps';

type CsvMappingModalArgs = Parameters<typeof useAppCsvMappingModalProps>[0];
type TrainerModalHostArgs = Parameters<typeof useAppTrainerModalHostProps>[0];
type TrainingRecordNoteModalArgs = Parameters<typeof useAppTrainingRecordNoteModalProps>[0];
type UtilityDialogsArgs = Parameters<typeof useAppUtilityDialogsProps>[0];

type UseAppRootModalPropsArgs = {
  csvMappingModal: CsvMappingModalArgs;
  trainerModalHost: TrainerModalHostArgs;
  trainingRecordNoteModal: TrainingRecordNoteModalArgs;
  utilityDialogs: UtilityDialogsArgs;
};

export type AppRootModalPropsBundle = {
  csvMappingModalProps: ReturnType<typeof useAppCsvMappingModalProps>;
  trainerModalHostProps: ReturnType<typeof useAppTrainerModalHostProps>;
  trainingRecordNoteModalProps: ReturnType<typeof useAppTrainingRecordNoteModalProps>;
  utilityDialogsProps: ReturnType<typeof useAppUtilityDialogsProps>;
};

export const useAppRootModalProps = ({
  csvMappingModal,
  trainerModalHost,
  trainingRecordNoteModal,
  utilityDialogs
}: UseAppRootModalPropsArgs): AppRootModalPropsBundle => ({
  csvMappingModalProps: useAppCsvMappingModalProps(csvMappingModal),
  trainerModalHostProps: useAppTrainerModalHostProps(trainerModalHost),
  trainingRecordNoteModalProps: useAppTrainingRecordNoteModalProps(trainingRecordNoteModal),
  utilityDialogsProps: useAppUtilityDialogsProps(utilityDialogs)
});
