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
  // analysisTypeは受け取らない: AnalysisResultScreenはanalysis.result.kind(サーバー側の実際の
  // 解析結果)で画面を出し分けており、遷移元が渡すanalysisTypeは使っていなかった。
  AnalysisResult: { analysisId: string };
  VoiceRecord: undefined;
  VoiceConfirm: { analysisId: string };
};
