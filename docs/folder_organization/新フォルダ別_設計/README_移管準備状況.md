# 新フォルダ別設計：移管準備状況

## 結論

**1〜3（08 の未記録判断・services/repos 振り分け・shared 具体設計）は 08_意思決定ログおよび各設計・04・00_shared に反映済みです。**  
残りは **移管順序の明文化**（4）と **analytics の nightly 3 本・createInitialStateDoc 等の細部**（5）です。これらを整えれば、段階的に移管を実行できる状態になります。

---

## 確定済み事項（08_意思決定ログ・設計に反映済み）

### 1. 08 で記録済みの判断（要約）

| 項目 | 決定内容 | 反映先 |
|------|----------|--------|
| **ルート index に shift を export するか** | **export する** | 03_shift, 08, 05 |
| **registerDevice / updateDeviceOptions / updateDeviceRole** | **shared/devices** に配置 | 10_user, 00_shared, 05, 08 |
| **calculateFirestoreSize** | **shared/firebase** に配置 | 10_user, 00_shared, 05, 08 |
| **qrCodeUtils** | **domains/user** に配置（user で OK） | 10_user, 08 |
| **getScheduledTournaments（TBD）** | **export しない**。**to_be_deleted** フォルダに **getScheduledTournaments_to_be_deleted.ts** で保存 | 06_tournament_createTournament, 04, 08 |
| **lineWebhook スタブ** | **一旦保留**。現状のままスタブと実装の両方を index に残す。確認後仮置きの文を削除予定 | 12_webhook, 08 |
| **serverStage / runtimePath** | **unused_function_lib** に格納。デプロイ不要 | 07_tournament_activeTournament, 04, 11_lib, 08 |
| **shared/businessHours** | 04 の shared カテゴリ表に **追加**。00_shared に設計・移動一覧を追加 | 04, 00_shared, 08 |

---

### 2. 「services か repos か」の確定（08 反映済み）

| 箇所 | 決定内容 |
|------|----------|
| **storeMeta** | close_process 由来 6 本は **基本的に services**。純粋に repos（書き込み等のみ）とする処理のみ repos に振り分け。設計ではすべて services に統一記載。 |
| **shift** | helpers は **基本的に services**。純粋に repos とするもののみ repos。設計では domains/shift/services に統一。 |

---

### 3. shared の具体設計（00_shared・04 に反映済み）

| shared カテゴリ | 反映内容 |
|-----------------|----------|
| **shared/time** | generateJstDateKey のパス、**config/ops を time に含める**（08 確定）。00_shared に移動一覧を記載。 |
| **shared/firebase** | **lib/env** を shared/firebase に移す。**calculateFirestoreSize** を shared/firebase に配置。他に移動すべきファイルが特になければ env と calculateFirestoreSize のみ。 |
| **shared/devices** | **lib/devicePermissions** を **shared/devices に移す**（08 確定）。requireAdmin に加え、registerDevice/updateDeviceOptions/updateDeviceRole を shared/devices/callables に配置。00_shared に移動一覧を記載。 |
| **shared/businessHours** | 04 の shared カテゴリに追加。00_shared にフォルダ構成・移動一覧を追加。 |
| **特殊フォルダ** | **to_be_deleted**（未使用関数退避）、**unused_function_lib**（未使用 lib 退避・デプロイ不要）を 04 に記載。 |

---

### 4. 移管順序の明文化

- **06_changeSpecテンプレ** はあるが、「**どのドメインを何番目に移管するか**」が設計内に書かれていない。
- 依存関係の例：
  - storeMeta → shared/time, shared/devices, shared/firebase
  - bills → storeMeta（getOpenBills の stateDoc 参照）
  - shift → shared/businessHours
  - staff → shift
  - itemOrder → bills/repos, storeMeta/repos, user/services
- **推奨**：  
  1. **shared**（time, devices, firebase, 必要なら businessHours）を先に移管し、import 先を確定させる。  
  2. そのうえで **domains** を依存の少ないものから（例: user → bills → storeMeta → …）移管する。  
- この順序を **06_changeSpec または別の「移管手順」ドキュメント** に明記すると、実作業で迷いが減ります。

---

### 5. その他・設計の細かい不足

| 項目 | 指しているもの | 他フォルダでの扱い | 必要な対応 |
|------|----------------|---------------------|------------|
| **analytics の nightly 3 本** | 上記の 3 つの onSchedule 入口。 | **domains/analytics/scheduler** に配置することを確定。**11_analytics** に移動一覧 3 行を追加、**05_入口一覧**を analytics / scheduler に更新済み。 |
| **storeMeta：CLI 用 createInitialStateDoc** | 上記の CLI 専用スクリプト。 | **domains/storeMeta** に配置することを確定。**02_storeMeta** に「scripts/createInitialStateDoc.ts → domains/storeMeta/scripts/createInitialStateDoc.ts」の移動行を追加済み。 |
| **changeSpec の実作業版** | — | 各設計の「changeSpec」は方針レベル。 | 06_changeSpecテンプレに沿ったドメイン別の実作業用 changeSpec は、移管開始前に 1 ブロック分でもよいので書いておくと安全。 |

---

## 移管を開始するために推奨するアクション

1. ~~08 で未決定の項目を決め、08_意思決定ログに記録する~~ → **済（上記 1〜3 を 08 および各設計に反映済み）**
2. ~~「services か repos か」を確定~~ → **済（storeMeta・shift は基本的に services で確定）**
3. ~~shared の設計を具体化・04 に businessHours 追加~~ → **済（00_shared に移動一覧・04 に businessHours と特殊フォルダを追加）**
4. **移管順序を 1 箇所に明記する**（06 または新規「移管手順」）。shared 先行 → domains を依存順に。
5. **analytics の nightly 3 本・storeMeta の createInitialStateDoc** を、該当設計の移動一覧または 08 で扱いを確定する。
6. **最初に移管するブロック**（例: shared/devices または shared/time）を決め、そのブロック用に **06_changeSpecテンプレに沿った changeSpec** を 1 本書き、移管とビルド検証を実施する。

4〜6 を済ませれば、移管を段階的に実行できます。

---

## 参考：設計が揃っている部分

- 各ドメイン（bills, storeMeta, shift, staff, attendance, tournament_createTournament, tournament_activeTournament, itemOrder, sideGame, user, analytics, webhook）の **移動一覧（from → to）** はほぼ記載済み。
- **index.ts 変更方針** と **検証手順** も各設計にあり。
- **04_新フォルダ構造** のドメイン一覧・shared カテゴリ（devices 含む）は定義済み（businessHours のみ 04 に未追加）。
- **00_shared** で shared 格納予定の一覧はある（ファイル単位のパス・移動一覧は shared ごとに差がある）。

つまり、「何をどこに移すか」の大方針は決まっており、**残りは判断の確定・shared の具体化・順序の明文化**です。
