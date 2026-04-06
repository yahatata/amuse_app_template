# phaseG.1 追加調査: 全関数20%ランダム抽出の環境変数実測

作成日: 2026-04-03

## 1. 抽出条件

- 対象: Cloud Functions v2 全関数（実測総数 174）
- 抽出率: 20%（切り上げ）
- 抽出数: 35
- 抽出方法: awk 乱数付与 + sort + head
- env 取得元: 各 Function が紐づく Cloud Run Service (gcloud run services describe)

## 2. サンプル対象関数（35）

- scheduled-job-enqueue-tournament-tasks-by-scheduler (asia-northeast1)
- updateBlindTemplate (asia-northeast1)
- processShiftsByStaff (asia-northeast1)
- getBillPreviewTotals (asia-northeast1)
- interimConfirmRequests (asia-northeast1)
- manualCheckIn (asia-northeast1)
- removeTableFromTournament (asia-northeast1)
- getTodayTournaments (asia-northeast1)
- updateDeviceRole (asia-northeast1)
- scheduled-job-scheduled-cleanup (asia-northeast1)
- verifyUnclockedAttendanceEditPassword (asia-northeast1)
- closeStoreTerminal (asia-northeast1)
- resetAllTables (asia-northeast1)
- completeAccounting (asia-northeast1)
- processRefund (asia-northeast1)
- rollbackAction (asia-northeast1)
- getAllStaffAttendance (asia-northeast1)
- updateScheduledTournamentStartAt (asia-northeast1)
- probeCloudTasksErrorShape (us-central1)
- finalizeUnsettledBillAfterAccounting (asia-northeast1)
- endTournament (asia-northeast1)
- registerParticipants (asia-northeast1)
- calculateFirestoreSize (asia-northeast1)
- updateDayAssignments (asia-northeast1)
- probeFirestoreErrorShape (us-central1)
- createManualClockInRecord (asia-northeast1)
- createInitialStateDocCallable (asia-northeast1)
- updateUnclockedAttendanceWithAuth (asia-northeast1)
- schedulerSupervisor (asia-northeast1)
- updateTournamentTemplate (asia-northeast1)
- setSufficientOverride (asia-northeast1)
- ensureStaffRichMenu (asia-northeast1)
- createStaffAccount (asia-northeast1)
- getPrizeData (asia-northeast1)
- updateStaffBankInfo (asia-northeast1)

## 3. 抽出された env キー（集計）

- CLOSE_ASSESSMENT_URL: 6 件
- CONTROL_HOOK_URL: 2 件
- DEBUG: 6 件
- ENABLE_AUTO_OPEN_CLOSE: 6 件
- ENABLE_SETTLEMENT_AGGREGATOR: 6 件
- ENQUEUE_SCHEDULER_ENABLED: 6 件
- EVENTARC_CLOUD_EVENT_SOURCE: 35 件
- FIREBASE_CONFIG: 35 件
- FUNCTION_SIGNATURE_TYPE: 32 件
- FUNCTION_TARGET: 35 件
- GCLOUD_PROJECT: 35 件
- LINE_CHANNEL_ACCESS_TOKEN: 6 件
- LINE_PLAN: 6 件
- LOG_EXECUTION_ID: 35 件
- NODE_ENV: 6 件
- OPEN_ASSESSMENT_URL: 6 件
- QR_SECRET_KEY: 6 件
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA: 6 件
- RECURRING_TOURNAMENT_TASKS_QUEUE: 6 件
- STAFF_RICHMENU_ID: 6 件
- TASKS_INVOKER_SA: 6 件
- TASKS_LOCATION: 6 件
- TASKS_QUEUE: 6 件
- TASK_CLOSE_OFFSET_MINUTES: 6 件
- TASK_OPEN_OFFSET_MINUTES: 6 件
- TEMPLATE_BUSINESSDATE_CHECK: 6 件
- USER_RICHMENU_ID: 6 件
- WEEKLYPLANNER_TASKS_LOCATION: 2 件
- WEEKLYPLANNER_TASKS_QUEUE: 6 件

## 4. キー別の現行ソース参照判定（functions/src）

- CLOSE_ASSESSMENT_URL: UNUSED_IN_SRC（サンプル内 6 件）
- CONTROL_HOOK_URL: UNUSED_IN_SRC（サンプル内 2 件）
- DEBUG: UNUSED_IN_SRC（サンプル内 6 件）
- ENABLE_AUTO_OPEN_CLOSE: UNUSED_IN_SRC（サンプル内 6 件）
- ENABLE_SETTLEMENT_AGGREGATOR: UNUSED_IN_SRC（サンプル内 6 件）
- ENQUEUE_SCHEDULER_ENABLED: UNUSED_IN_SRC（サンプル内 6 件）
- EVENTARC_CLOUD_EVENT_SOURCE: UNUSED_IN_SRC（サンプル内 35 件）
- FIREBASE_CONFIG: UNUSED_IN_SRC（サンプル内 35 件）
- FUNCTION_SIGNATURE_TYPE: UNUSED_IN_SRC（サンプル内 32 件）
- FUNCTION_TARGET: UNUSED_IN_SRC（サンプル内 35 件）
- GCLOUD_PROJECT: USED（サンプル内 35 件）
- LINE_CHANNEL_ACCESS_TOKEN: UNUSED_IN_SRC（サンプル内 6 件）
- LINE_PLAN: UNUSED_IN_SRC（サンプル内 6 件）
- LOG_EXECUTION_ID: UNUSED_IN_SRC（サンプル内 35 件）
- NODE_ENV: USED（サンプル内 6 件）
- OPEN_ASSESSMENT_URL: UNUSED_IN_SRC（サンプル内 6 件）
- QR_SECRET_KEY: UNUSED_IN_SRC（サンプル内 6 件）
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA: UNUSED_IN_SRC（サンプル内 6 件）
- RECURRING_TOURNAMENT_TASKS_QUEUE: UNUSED_IN_SRC（サンプル内 6 件）
- STAFF_RICHMENU_ID: UNUSED_IN_SRC（サンプル内 6 件）
- TASKS_INVOKER_SA: UNUSED_IN_SRC（サンプル内 6 件）
- TASKS_LOCATION: UNUSED_IN_SRC（サンプル内 6 件）
- TASKS_QUEUE: UNUSED_IN_SRC（サンプル内 6 件）
- TASK_CLOSE_OFFSET_MINUTES: UNUSED_IN_SRC（サンプル内 6 件）
- TASK_OPEN_OFFSET_MINUTES: UNUSED_IN_SRC（サンプル内 6 件）
- TEMPLATE_BUSINESSDATE_CHECK: UNUSED_IN_SRC（サンプル内 6 件）
- USER_RICHMENU_ID: UNUSED_IN_SRC（サンプル内 6 件）
- WEEKLYPLANNER_TASKS_LOCATION: UNUSED_IN_SRC（サンプル内 2 件）
- WEEKLYPLANNER_TASKS_QUEUE: UNUSED_IN_SRC（サンプル内 6 件）

## 5. 関数別 env 一覧（機密値マスク）

### scheduled-job-enqueue-tournament-tasks-by-scheduler (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/scheduled-job-enqueue-tournament-tasks-by-scheduler
- FUNCTION_TARGET=scheduled.job.enqueue.tournament.tasks.by.scheduler
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### updateBlindTemplate (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateBlindTemplate
- FUNCTION_TARGET=updateBlindTemplate
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### processShiftsByStaff (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/processShiftsByStaff
- FUNCTION_TARGET=processShiftsByStaff
- LOG_EXECUTION_ID=true

### getBillPreviewTotals (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/getBillPreviewTotals
- FUNCTION_TARGET=getBillPreviewTotals
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### interimConfirmRequests (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/interimConfirmRequests
- FUNCTION_TARGET=interimConfirmRequests
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### manualCheckIn (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/manualCheckIn
- FUNCTION_TARGET=manualCheckIn
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### removeTableFromTournament (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/removeTableFromTournament
- FUNCTION_TARGET=removeTableFromTournament
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### getTodayTournaments (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/getTodayTournaments
- FUNCTION_TARGET=getTodayTournaments
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### updateDeviceRole (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateDeviceRole
- FUNCTION_TARGET=updateDeviceRole
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### scheduled-job-scheduled-cleanup (asia-northeast1)

- QR_SECRET_KEY=<redacted>
- NODE_ENV=development
- DEBUG=true
- LINE_CHANNEL_ACCESS_TOKEN=<redacted>
- STAFF_RICHMENU_ID=richmenu-36bb594eadf1c8718bd9c12199c87dbb
- USER_RICHMENU_ID=richmenu-31d87049e04ae740ceaa76cf59950f54
- LINE_PLAN=communication
- ENABLE_SETTLEMENT_AGGREGATOR=true
- TASKS_QUEUE=tournament-queue
- TASKS_LOCATION=asia-northeast1
- TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- TEMPLATE_BUSINESSDATE_CHECK=true
- RECURRING_TOURNAMENT_TASKS_QUEUE=tournament-queue
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- ENABLE_AUTO_OPEN_CLOSE=true
- TASK_CLOSE_OFFSET_MINUTES=120
- TASK_OPEN_OFFSET_MINUTES=-30
- CLOSE_ASSESSMENT_URL=https://closeassessmenttask-iigzogr4ca-uc.a.run.app
- OPEN_ASSESSMENT_URL=https://openassessmenttask-iigzogr4ca-uc.a.run.app
- WEEKLYPLANNER_TASKS_QUEUE=business-date-assessment-queue
- ENQUEUE_SCHEDULER_ENABLED=true
- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/scheduled-job-scheduled-cleanup
- FUNCTION_TARGET=scheduled.job.scheduled.cleanup
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### verifyUnclockedAttendanceEditPassword (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/verifyUnclockedAttendanceEditPassword
- FUNCTION_TARGET=verifyUnclockedAttendanceEditPassword
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### closeStoreTerminal (asia-northeast1)

- QR_SECRET_KEY=<redacted>
- NODE_ENV=development
- DEBUG=true
- LINE_CHANNEL_ACCESS_TOKEN=<redacted>
- STAFF_RICHMENU_ID=richmenu-36bb594eadf1c8718bd9c12199c87dbb
- USER_RICHMENU_ID=richmenu-31d87049e04ae740ceaa76cf59950f54
- LINE_PLAN=communication
- ENABLE_SETTLEMENT_AGGREGATOR=true
- TASKS_QUEUE=tournament-queue
- TASKS_LOCATION=asia-northeast1
- TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- TEMPLATE_BUSINESSDATE_CHECK=true
- RECURRING_TOURNAMENT_TASKS_QUEUE=tournament-queue
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- ENABLE_AUTO_OPEN_CLOSE=true
- TASK_CLOSE_OFFSET_MINUTES=120
- TASK_OPEN_OFFSET_MINUTES=-30
- CLOSE_ASSESSMENT_URL=https://closeassessmenttask-iigzogr4ca-uc.a.run.app
- OPEN_ASSESSMENT_URL=https://openassessmenttask-iigzogr4ca-uc.a.run.app
- WEEKLYPLANNER_TASKS_QUEUE=business-date-assessment-queue
- ENQUEUE_SCHEDULER_ENABLED=true
- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/closeStoreTerminal
- FUNCTION_TARGET=closeStoreTerminal
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### resetAllTables (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/resetAllTables
- FUNCTION_TARGET=resetAllTables
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### completeAccounting (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/completeAccounting
- FUNCTION_TARGET=completeAccounting
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### processRefund (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/processRefund
- FUNCTION_TARGET=processRefund
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### rollbackAction (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/rollbackAction
- FUNCTION_TARGET=rollbackAction
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### getAllStaffAttendance (asia-northeast1)

- QR_SECRET_KEY=<redacted>
- NODE_ENV=development
- DEBUG=true
- LINE_CHANNEL_ACCESS_TOKEN=<redacted>
- STAFF_RICHMENU_ID=richmenu-36bb594eadf1c8718bd9c12199c87dbb
- USER_RICHMENU_ID=richmenu-31d87049e04ae740ceaa76cf59950f54
- LINE_PLAN=communication
- ENABLE_SETTLEMENT_AGGREGATOR=true
- TASKS_QUEUE=tournament-queue
- TASKS_LOCATION=asia-northeast1
- TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- TEMPLATE_BUSINESSDATE_CHECK=true
- RECURRING_TOURNAMENT_TASKS_QUEUE=tournament-queue
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- ENABLE_AUTO_OPEN_CLOSE=true
- TASK_CLOSE_OFFSET_MINUTES=120
- TASK_OPEN_OFFSET_MINUTES=-30
- CLOSE_ASSESSMENT_URL=https://closeassessmenttask-iigzogr4ca-uc.a.run.app
- OPEN_ASSESSMENT_URL=https://openassessmenttask-iigzogr4ca-uc.a.run.app
- WEEKLYPLANNER_TASKS_QUEUE=business-date-assessment-queue
- ENQUEUE_SCHEDULER_ENABLED=true
- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/getAllStaffAttendance
- FUNCTION_TARGET=getAllStaffAttendance
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### updateScheduledTournamentStartAt (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateScheduledTournamentStartAt
- FUNCTION_TARGET=updateScheduledTournamentStartAt
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### probeCloudTasksErrorShape (us-central1)

- QR_SECRET_KEY=<redacted>
- NODE_ENV=development
- DEBUG=true
- LINE_CHANNEL_ACCESS_TOKEN=<redacted>
- STAFF_RICHMENU_ID=richmenu-36bb594eadf1c8718bd9c12199c87dbb
- USER_RICHMENU_ID=richmenu-31d87049e04ae740ceaa76cf59950f54
- LINE_PLAN=communication
- ENABLE_SETTLEMENT_AGGREGATOR=true
- CONTROL_HOOK_URL=https://us-central1-amuse-app-template.cloudfunctions.net/controlHookHttp
- TASKS_QUEUE=tournament-queue
- TASKS_LOCATION=asia-northeast1
- TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- TEMPLATE_BUSINESSDATE_CHECK=true
- RECURRING_TOURNAMENT_TASKS_QUEUE=tournament-queue
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- ENABLE_AUTO_OPEN_CLOSE=true
- TASK_CLOSE_OFFSET_MINUTES=120
- TASK_OPEN_OFFSET_MINUTES=-30
- CLOSE_ASSESSMENT_URL=https://closeassessmenttask-iigzogr4ca-uc.a.run.app
- OPEN_ASSESSMENT_URL=https://openassessmenttask-iigzogr4ca-uc.a.run.app
- WEEKLYPLANNER_TASKS_QUEUE=business-date-assessment-queue
- WEEKLYPLANNER_TASKS_LOCATION=us-central1
- ENQUEUE_SCHEDULER_ENABLED=true
- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/us-central1/services/probeCloudTasksErrorShape
- FUNCTION_TARGET=probeCloudTasksErrorShape
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### finalizeUnsettledBillAfterAccounting (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/finalizeUnsettledBillAfterAccounting
- FUNCTION_TARGET=finalizeUnsettledBillAfterAccounting
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### endTournament (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/endTournament
- FUNCTION_TARGET=endTournament
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### registerParticipants (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/registerParticipants
- FUNCTION_TARGET=registerParticipants
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### calculateFirestoreSize (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/calculateFirestoreSize
- FUNCTION_TARGET=calculateFirestoreSize
- LOG_EXECUTION_ID=true

### updateDayAssignments (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateDayAssignments
- FUNCTION_TARGET=updateDayAssignments
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### probeFirestoreErrorShape (us-central1)

- QR_SECRET_KEY=<redacted>
- NODE_ENV=development
- DEBUG=true
- LINE_CHANNEL_ACCESS_TOKEN=<redacted>
- STAFF_RICHMENU_ID=richmenu-36bb594eadf1c8718bd9c12199c87dbb
- USER_RICHMENU_ID=richmenu-31d87049e04ae740ceaa76cf59950f54
- LINE_PLAN=communication
- ENABLE_SETTLEMENT_AGGREGATOR=true
- CONTROL_HOOK_URL=https://us-central1-amuse-app-template.cloudfunctions.net/controlHookHttp
- TASKS_QUEUE=tournament-queue
- TASKS_LOCATION=asia-northeast1
- TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- TEMPLATE_BUSINESSDATE_CHECK=true
- RECURRING_TOURNAMENT_TASKS_QUEUE=tournament-queue
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- ENABLE_AUTO_OPEN_CLOSE=true
- TASK_CLOSE_OFFSET_MINUTES=120
- TASK_OPEN_OFFSET_MINUTES=-30
- CLOSE_ASSESSMENT_URL=https://closeassessmenttask-iigzogr4ca-uc.a.run.app
- OPEN_ASSESSMENT_URL=https://openassessmenttask-iigzogr4ca-uc.a.run.app
- WEEKLYPLANNER_TASKS_QUEUE=business-date-assessment-queue
- WEEKLYPLANNER_TASKS_LOCATION=us-central1
- ENQUEUE_SCHEDULER_ENABLED=true
- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/us-central1/services/probeFirestoreErrorShape
- FUNCTION_TARGET=probeFirestoreErrorShape
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### createManualClockInRecord (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/createManualClockInRecord
- FUNCTION_TARGET=createManualClockInRecord
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### createInitialStateDocCallable (asia-northeast1)

- QR_SECRET_KEY=<redacted>
- NODE_ENV=development
- DEBUG=true
- LINE_CHANNEL_ACCESS_TOKEN=<redacted>
- STAFF_RICHMENU_ID=richmenu-36bb594eadf1c8718bd9c12199c87dbb
- USER_RICHMENU_ID=richmenu-31d87049e04ae740ceaa76cf59950f54
- LINE_PLAN=communication
- ENABLE_SETTLEMENT_AGGREGATOR=true
- TASKS_QUEUE=tournament-queue
- TASKS_LOCATION=asia-northeast1
- TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- TEMPLATE_BUSINESSDATE_CHECK=true
- RECURRING_TOURNAMENT_TASKS_QUEUE=tournament-queue
- RECURRING_TOURNAMENT_TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
- ENABLE_AUTO_OPEN_CLOSE=true
- TASK_CLOSE_OFFSET_MINUTES=120
- TASK_OPEN_OFFSET_MINUTES=-30
- CLOSE_ASSESSMENT_URL=https://closeassessmenttask-iigzogr4ca-uc.a.run.app
- OPEN_ASSESSMENT_URL=https://openassessmenttask-iigzogr4ca-uc.a.run.app
- WEEKLYPLANNER_TASKS_QUEUE=business-date-assessment-queue
- ENQUEUE_SCHEDULER_ENABLED=true
- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/createInitialStateDocCallable
- FUNCTION_TARGET=createInitialStateDocCallable
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### updateUnclockedAttendanceWithAuth (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateUnclockedAttendanceWithAuth
- FUNCTION_TARGET=updateUnclockedAttendanceWithAuth
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### schedulerSupervisor (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/schedulerSupervisor
- FUNCTION_TARGET=schedulerSupervisor
- LOG_EXECUTION_ID=true

### updateTournamentTemplate (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateTournamentTemplate
- FUNCTION_TARGET=updateTournamentTemplate
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### setSufficientOverride (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/setSufficientOverride
- FUNCTION_TARGET=setSufficientOverride
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### ensureStaffRichMenu (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/ensureStaffRichMenu
- FUNCTION_TARGET=ensureStaffRichMenu
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### createStaffAccount (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/createStaffAccount
- FUNCTION_TARGET=createStaffAccount
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### getPrizeData (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/getPrizeData
- FUNCTION_TARGET=getPrizeData
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

### updateStaffBankInfo (asia-northeast1)

- FIREBASE_CONFIG={"projectId":"amuse-app-template","storageBucket":"amuse-app-template.firebasestorage.app"}
- GCLOUD_PROJECT=amuse-app-template
- EVENTARC_CLOUD_EVENT_SOURCE=projects/amuse-app-template/locations/asia-northeast1/services/updateStaffBankInfo
- FUNCTION_TARGET=updateStaffBankInfo
- LOG_EXECUTION_ID=true
- FUNCTION_SIGNATURE_TYPE=http

## 6. 判定

- 結論: 存在しても問題ない環境変数のみ、という状態ではない。
- 理由:
  - プラットフォーム既定キー（FUNCTION_TARGET など）に加えて、アプリ固有キー（LINE_CHANNEL_ACCESS_TOKEN、QR_SECRET_KEY 等）が混在。
  - 現行 functions/src で未参照のキーが多数存在し、設定ドリフト（過去運用の残存）の状態。
  - CONTROL_HOOK_URL / WEEKLYPLANNER_TASKS_LOCATION は、sample内では us-central1 の probe 関数にのみ残存（asia 本線では今回回収済み）。
