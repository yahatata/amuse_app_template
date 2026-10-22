# Phase6 Step2 実装 確認観点一覧・検証結果

**実装完了日**: 2025年2月

本チェックリストは「未会計billsの移管」UI（システム設定画面の取得・一覧・closeSnapshot 付与）および Step2 完了に含まれる「未会計の会計」フローの確認観点をまとめたものです。

---

## 1. 確認すべき観点（全項目）

### A. ChangeSpec 仕様適合

| # | 観点 | 確認方法 |
|---|------|----------|
| A1 | closeSnapshot は監査/運用ラベルであり、status や既存 write-guard に影響しない | コードレビュー（bills の status 更新・既存ガードの変更がないこと） |
| A2 | 未会計の定義: 当日営業日 & status in ['open','in_progress','settling'] | 取得・付与両方のクエリ/判定で一致していること |
| A3 | 営業日はサーバー側 getCurrentBusinessDateKeyOrThrow のみ使用（クライアント入力は信用しない） | コード上 request.data から businessDate/closedBusinessDate を取っていないこと |
| A4 | lastCloseRunId は Step2 で必ず 'step2-manual'（空文字・未設定・null 禁止） | 定数 LAST_CLOSE_RUN_ID_STEP2 のみ使用していること |
| A5 | 既に closeSnapshot が存在する場合は上書きしない（already_marked / invalid_closeSnapshot_shape でスキップ） | isCloseSnapshotValidShape と transaction 内分岐の確認 |
| A6 | closeSnapshot の構造: lastCloseRunId, markedAt, closedBusinessDate, unresolved: true | update payload の確認 |
| A7 | 部分成功: 1件失敗しても他は更新し、skipped に reason 付きで返す | ループ内で continue/skip しつつ updatedBillIds/skipped を返していること |
| A8 | 冪等性: 同じ billId に再実行しても already_marked でスキップ | 既存 closeSnapshot の妥当形判定でスキップしていること |

### B. 権限・セキュリティ

| # | 観点 | 確認方法 |
|---|------|----------|
| B1 | 未認証では取得・付与どちらも拒否（unauthenticated） | request.auth チェックが先頭にあること |
| B2 | 管理者以外は拒否（permission-denied）：devices で uid 一致 & role=='admin' | requireAdmin(db, uid) が両 Callable で呼ばれていること |
| B3 | Firestore への書き込みは Functions のみ（クライアント直書き禁止） | Flutter に collection/set/update/add がないこと |

### C. データ・表示

| # | 観点 | 確認方法 |
|---|------|----------|
| C1 | 金額は server-side 算出（getBillPreviewTotals 相当: extras/items/sideGameChips/tournaments） | computeDisplayAmount のロジックが getBillPreviewTotals と整合していること |
| C2 | 入店日時は bills.createdAt を表示用にフォーマット（JST/ローカルで表示） | toISOString 送信 + Flutter で dt.toLocal() してから format していること |
| C3 | 取得返却: billId, pokerName, displayAmount, createdAt, returnedCount, truncated | 返却オブジェクトのキー確認 |
| C4 | 付与返却: updatedBillIds, skipped, updatedCount | 返却オブジェクトのキー確認 |

### D. UI・導線

| # | 観点 | 確認方法 |
|---|------|----------|
| D1 | システム設定に「未会計billsの移管」ボタンがある | systemSettingsPage に該当 Card があること |
| D2 | 取得 → 一覧ダイアログ（pokerName / 金額 / 入店日時）→ 全件確定 → 結果表示 | フローが ChangeSpec 通りであること |
| D3 | 0件時は「未会計の伝票はありません」表示、確定ボタンは出さない | 0件分岐で確定ボタンなしであること |
| D4 | 結果で成功(updated)とスキップ(skipped)を bill 単位表示 | 結果ダイアログの表示内容 |
| D5 | 再試行は already_marked と invalid_closeSnapshot_shape を除く | retryable の条件式確認 |
| D6 | invalid_closeSnapshot_shape 時は「closeSnapshotが壊れているため手動修正が必要」等の文言 | 表示文言の確認 |

### E. 堅牢化・パフォーマンス

| # | 観点 | 確認方法 |
|---|------|----------|
| E1 | 取得クエリに limit(MAX+1) を付け、読み取り暴走を防止 | .limit(MAX_UNSETTLED_BILLS_RETURNED + 1) があること |
| E2 | truncated / returnedCount を返却（上限超過時） | 返却オブジェクトに含まれていること |
| E3 | 付与は bill ごとに transaction（read→判定→update）で原子実行 | db.runTransaction 内で get→判定→update していること |
| E4 | billIds の重複排除（uniqueBillIds）で無駄な txn を削減 | Array.from(new Set(billIds)) していること |
| E5 | ローディング dialog の pop で canPop() ガード | Navigator.of(context).canPop() でガードしていること |
| E6 | Functions 例外は FirebaseFunctionsException の code で分岐 | e.code == 'unauthenticated' \|\| 'permission-denied' で分岐していること |

### F. ビルド・静的検証

| # | 観点 | 確認方法 |
|---|------|----------|
| F1 | TypeScript がコンパイルエラーなくビルドできる | npm run build 成功 |
| F2 | Flutter で Lint エラーがない | flutter analyze / IDE lint でエラーなし |

### G. 動作・E2E（手動/環境依存）

| # | 観点 | 確認方法 |
|---|------|----------|
| G1 | 当日・未会計の bills が取得でき、一覧に表示される | 実機/エミュレータで取得〜表示 |
| G2 | 確定で closeSnapshot が付与され、lastCloseRunId が 'step2-manual' である | Firestore コンソールで該当 bill を確認 |
| G3 | 既に closeSnapshot がある bill は already_marked でスキップされる | 再実行して結果表示を確認 |
| G4 | 権限のないユーザーでは取得・付与がエラーになる | 非管理者で実行してエラー表示を確認 |
| G5 | 入店日時が JST（ローカル）で正しく表示される（-9時間ずれがない） | 一覧で日時表示を目視確認 |
| G6 | 100件超で truncated となり、返却は最大100件である | 100件超のデータで取得結果を確認 |

---

## 2. 自動・コード上で実施した確認結果

以下は本ドキュメント作成時に実施した検証の結果です。

### A. ChangeSpec 仕様適合

| # | 結果 | 補足 |
|---|------|------|
| A1 | ✅ | bills の status 更新・既存ガード変更はなし。closeSnapshot 追加のみ。 |
| A2 | ✅ | getUnsettledBillsForClose: where('status','in',[...]). applyCloseSnapshot: ALLOWED_STATUSES で同一。 |
| A3 | ✅ | closedBusinessDate / businessDate はともに getCurrentBusinessDateKeyOrThrow() のみ。request.data からは billIds のみ取得。 |
| A4 | ✅ | LAST_CLOSE_RUN_ID_STEP2 = 'step2-manual' を update で使用。他に lastCloseRunId を設定する箇所なし。 |
| A5 | ✅ | isCloseSnapshotValidShape で妥当形のみ already_marked。それ以外の object は invalid_closeSnapshot_shape。上書きしない。 |
| A6 | ✅ | txn.update で closeSnapshot: { lastCloseRunId, markedAt, closedBusinessDate, unresolved: true }, updatedAt。 |
| A7 | ✅ | for ループ内で skipped.push / updatedBillIds.push し、最後に success, updatedBillIds, skipped, updatedCount を返却。 |
| A8 | ✅ | 既存 closeSnapshot が妥当形なら already_marked でスキップするため冪等。 |

### B. 権限・セキュリティ

| # | 結果 | 補足 |
|---|------|------|
| B1 | ✅ | 両 Callable 先頭で if (!request.auth) throw HttpsError('unauthenticated', ...)。 |
| B2 | ✅ | 両方で await requireAdmin(db, adminId)。requireAdmin は devices の uid & role=='admin'、empty で permission-denied。 |
| B3 | ✅ | systemSettingsPage.dart に collection(・set(・update(・add( の呼び出しなし（Firestore 書き込みは Functions のみ）。 |

### C. データ・表示

| # | 結果 | 補足 |
|---|------|------|
| C1 | ✅ | computeDisplayAmount は extras/items/sideGameChips(action==purchase)/tournaments から金額算出。getBillPreviewTotals と同様。 |
| C2 | ✅ | 取得: createdAt.toDate().toISOString() で返却。Flutter: DateTime.parse(iso).toLocal() のうえ DateFormat で表示。 |
| C3 | ✅ | return { success: true, data, returnedCount: data.length, truncated }。 |
| C4 | ✅ | return { success: true, updatedBillIds, skipped, updatedCount }。 |

### D. UI・導線

| # | 結果 | 補足 |
|---|------|------|
| D1 | ✅ | 「未会計billsの移管」Card が閉店クリーンアップの次に存在。 |
| D2 | ✅ | _openUnsettledBillsFlow → 一覧 _showUnsettledBillsListDialog → 全件確定で _executeApplyCloseSnapshot → 結果 _showApplyCloseSnapshotResultDialog。 |
| D3 | ✅ | data.isEmpty 時に「未会計の伝票はありません」ダイアログのみ表示し、確定ボタンは出さない。 |
| D4 | ✅ | 「完了: N件」と skipped の billId + reason（または displayReason）を表示。 |
| D5 | ✅ | retryable = skipped.where((e) => e['reason'] != 'already_marked' && e['reason'] != 'invalid_closeSnapshot_shape').toList()。 |
| D6 | ✅ | reason == 'invalid_closeSnapshot_shape' のとき displayReason = 'closeSnapshotが壊れているため手動修正が必要'。 |

### E. 堅牢化・パフォーマンス

| # | 結果 | 補足 |
|---|------|------|
| E1 | ✅ | .limit(MAX_UNSETTLED_BILLS_RETURNED + 1) をクエリに付与。 |
| E2 | ✅ | returnedCount: data.length, truncated: billsSnap.docs.length > MAX_UNSETTLED_BILLS_RETURNED。 |
| E3 | ✅ | db.runTransaction 内で txn.get(billRef)→存在・businessDate・status・closeSnapshot 判定→txn.update。 |
| E4 | ✅ | const uniqueBillIds = Array.from(new Set(billIds)); for (const billId of uniqueBillIds)。 |
| E5 | ✅ | 成功時・catch 時の pop 前に Navigator.of(context).canPop() でガード（4箇所）。 |
| E6 | ✅ | catch で if (e is FirebaseFunctionsException) { if (e.code == 'unauthenticated' || e.code == 'permission-denied') ... }。 |

### F. ビルド・静的検証

| # | 結果 | 補足 |
|---|------|------|
| F1 | ✅ | functions で npm run build 成功（tsc エラーなし）。 |
| F2 | ✅ | systemSettingsPage.dart および関連 Functions で ReadLints エラーなし。 |

### G. 動作・E2E

| # | 結果 | 補足 |
|---|------|------|
| G1〜G6 | 未実施 | 実機/エミュレータ・Firestore データが必要。手動または E2E で確認すること。 |

---

## 3. 要手動確認項目（実施推奨）

- **G1** 取得〜一覧表示が意図どおりか（0件・1件・複数件・100件超）
- **G2** 確定後に Firestore で closeSnapshot と lastCloseRunId='step2-manual' の有無
- **G3** 既存 closeSnapshot 付き bill で already_marked になるか
- **G4** 非管理者で unauthenticated / permission-denied になるか
- **G5** 入店日時が JST（ローカル）でずれなく表示されるか
- **G6** 101件以上で truncated かつ返却 100 件になるか

---

## 4. 未会計の会計フロー（Step2 完了に含まれる追加実装）の確認観点

以下は「未会計の会計」画面・導線の確認用です。詳細仕様は `implementation_summary.md` §10 を参照。

| # | 観点 | 確認方法 |
|---|------|----------|
| H1 | ターミナルホームに「未会計の会計」入口がある | terminalHomePage にボタンがあり、タップで UnsettledAccountingPage が開くこと |
| H2 | 未会計の会計ページのタブ「日付ごと」「ユーザー別」のラベルが白系で見える | TabBar の labelColor / unselectedLabelColor が白系であること |
| H3 | ユーザー別で選択したユーザーの未会計bills一覧で、各カードに pokerName と **営業日** が表示される（請求書IDは表示されない） | _buildBillCard の subtitle が「営業日: YYYY/MM/DD」形式であること |
| H4 | 未会計billのカードタップで会計ページに遷移し、会計完了後に finalizeUnsettledBillAfterAccounting が呼ばれる | 会計完了後、closeSnapshot.unresolved が false になり、unsettledBillsCount が減ること（手動またはログで確認） |
| H5 | 会計管理ページ（通常の会計一覧）に closeSnapshot.unresolved が true の bill が表示されない | accountingPage の一覧取得・表示で未会計ラベル付きが除外されていること |

以上。
