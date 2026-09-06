import type { AnalysisType } from "../types";

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  FridgeList: undefined;
  AddMenu: undefined;
  ConsumeMenu: undefined;
  AddItemManual: undefined;
  ConsumeManual: undefined;
  Camera: { analysisType: AnalysisType };
  AnalysisResult: { analysisId: string };
  VoiceRecord: undefined;
  VoiceConfirm: { analysisId: string };
};
