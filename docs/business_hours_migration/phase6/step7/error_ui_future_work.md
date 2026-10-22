# Phase6 Step7: エラー表示の今後の実装（検討事項）

本ドキュメントは **今後実装が必要となる可能性がある** 事項を記載する。現時点では実装タスクとしては確定していない。

---

## 背景

Phase6 Step4 仕様では、**status === 'error'** のときに「lastError の要約を表示し、復旧操作を促す」としている。**当面の実装**では、ダイアログで lastError の内容（code / message / failedStep 等）をそのまま表示する方針とする。

一方で、エラーコードやメッセージが多様化した場合、**UI 上でエラー内容を正しく理解できるようにする**ため、以下の整備が必要になる可能性がある。

---

## 今後の実装が必要となる可能性があるもの

1. **エラー内容と出力の一覧**
   - lastError に格納され得る **code / message / failedStep** および発生元（closeAssessmentTask / openAssessmentTask / createInitialStateDocCallable 等）の一覧をドキュメント化する。
   - 各エラーについて、**ユーザー向けに表示すべき文言**（日本語の説明文）と、**技術的な出力**（ログ・デバッグ用）の対応表を整備する。

2. **UI でのエラー理解**
   - 上記一覧に基づき、**エラーコードや failedStep に対応したユーザー向けメッセージ**を表示する。
   - 必要に応じて「どの操作を試すか」「管理者に伝えるべき情報」を UI 上で案内する。
   - エラー内容が UI で分かるようにするため、要約フォーマット・表示場所・復旧操作の具体的 UI（ボタン文言・遷移先）を仕様化する可能性がある。

---

## 参照

- Phase6 Step4 仕様書（spec.md）§4 項目 1: status === 'error' の表示方針。
- storeMeta/currentBusinessDay の **lastError** スキーマ: spec §2.1（code, message, failedStep, at, context?）。

---

以上。本 Step7 は「今後の実装が必要なもの」としてフォルダおよび本ドキュメントを残す。
