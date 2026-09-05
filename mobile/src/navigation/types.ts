import type { AnalysisType } from "../types";

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  FridgeList: undefined;
  AddItemManual: undefined;
  Camera: { analysisType: AnalysisType };
  AnalysisResult: { analysisId: string; analysisType: AnalysisType };
};
