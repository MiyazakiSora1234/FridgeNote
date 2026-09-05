/**
 * AI認識結果の確信度がこの値未満の場合、UIで「認識結果を確認してください」と警告する。
 *
 * 注意: バックエンド側の同名の閾値(backend/src/schemas/aiSchemas.ts の
 * LOW_CONFIDENCE_THRESHOLD)と値を一致させること。型/定数をnpm workspacesで
 * 共有する構成(モノレポ化)も検討したが、Expo/Metro側のモノレポ対応
 * (symlink解決・watchFolders設定)をこの環境では実機検証できないため、
 * 現時点では見送り、値の一致は `scripts/check-shared-constants.mjs` の
 * 整合性チェック(CI実行)で担保している。
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
