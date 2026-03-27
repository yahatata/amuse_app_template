import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  getDisplayBusinessDateKeyForNonRunning,
  getShiftDateKeyForNonRunning,
} from '../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow';
import { logOpsError } from "../../../shared/logging/logOpsError";

async function getAttendanceAndShiftDates(): Promise<{
  status: string;
  attendanceDate: string;
  shiftDate: string;
}> {
  const docRef = admin.firestore().collection('storeMeta').doc('currentBusinessDay');
  const doc = await docRef.get();
  const data = doc.exists ? doc.data() : null;
  const status = (data?.status as string) ?? '';

  if (status === 'running' && data?.currentBusinessDateKey != null) {
    const key = String(data.currentBusinessDateKey).trim();
    return { status: 'running', attendanceDate: key, shiftDate: key };
  }
  const attendanceDate = await getDisplayBusinessDateKeyForNonRunning();
  const shiftDate = await getShiftDateKeyForNonRunning();
  return { status: 'non-running', attendanceDate, shiftDate };
}

export const getStaffListForAttendance = onCall(async (request: CallableRequest) => {
  try {
    const { data } = request;

    // リクエストデータの検証
    const { isClockInMode } = data as { isClockInMode: boolean };

    if (typeof isClockInMode !== 'boolean') {
      throw new HttpsError(
        'invalid-argument',
        'isClockInMode is required and must be a boolean'
      );
    }

    // 営業日を取得（CHANGESPEC 6-4: status=running なら currentBusinessDateKey、
    // status≠running なら 勤怠=lastClosedBusinessDateKey、シフト=その翌日）
    const { attendanceDate, shiftDate } = await getAttendanceAndShiftDates();

    let staffList: any[] = [];

    if (isClockInMode) {
      // 出勤モード：全スタッフを取得し、当日シフトの有無でソート
      const staffsSnapshot = await admin.firestore()
        .collection('staffs')
        .get();

      const staffs = staffsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          fullName: data.fullName || '',
          fullNameKana: data.fullNameKana || '',
          position: data.position || 'スタッフ',
        };
      });

      // シフト情報を取得（CHANGESPEC 6-4: status≠running 時は翌日）
      const shiftsSnapshot = await admin.firestore()
        .collection('shifts')
        .where('date', '==', shiftDate)
        .where('status', '==', 'approved')
        .get();

      const shifts = shiftsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          staffId: data.staffId || '',
          startTime: data.start || '',
        };
      });

      // 出勤済みのスタッフを取得（CHANGESPEC 6-4: status≠running 時は lastClosedBusinessDateKey）
      const attendancesSnapshot = await admin.firestore()
        .collection('attendances')
        .where('date', '==', attendanceDate)
        .where('clockOut', '==', null)
        .get();

      const clockedInStaffIds = attendancesSnapshot.docs.map(doc => doc.data().staffId);

      // スタッフにシフト情報を追加（出勤済みは除外）
      staffList = staffs
        .filter(staff => !clockedInStaffIds.includes(staff.uid)) // 出勤済みを除外
        .map(staff => {
          const shift = shifts.find(s => s.staffId === staff.uid);
          
          return {
            uid: staff.uid,
            fullName: staff.fullName || '',
            fullNameKana: staff.fullNameKana || '',
            position: staff.position || 'スタッフ',
            hasShiftToday: shift != null,
            shiftStart: shift?.startTime || null,
          };
        });

      // 当日シフトがあるスタッフを上に、残りをかな順でソート
      staffList.sort((a, b) => {
        // まず当日シフトの有無でソート
        if (a.hasShiftToday && !b.hasShiftToday) return -1;
        if (!a.hasShiftToday && b.hasShiftToday) return 1;
        
        // 両方ともシフトがある場合、開始時刻でソート
        if (a.hasShiftToday && b.hasShiftToday) {
          if (a.shiftStart != null && b.shiftStart != null) {
            return a.shiftStart.localeCompare(b.shiftStart);
          }
        }
        
        // かな順でソート
        return a.fullNameKana.localeCompare(b.fullNameKana);
      });

    } else {
      // 退勤モード：出勤済みで退勤していないスタッフを取得（CHANGESPEC 6-4）
      const attendancesSnapshot = await admin.firestore()
        .collection('attendances')
        .where('date', '==', attendanceDate)
        .where('clockOut', '==', null)
        .get();

      const attendances = attendancesSnapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          docId: doc.id,
          staffId: docData.staffId || '',
          clockIn: docData.clockIn,
          closedStoreWithoutClockOut: docData.closedStoreWithoutClockOut === true,
        };
      });

      // スタッフ情報を取得
      for (const attendance of attendances) {
        const staffDoc = await admin.firestore()
          .collection('staffs')
          .doc(attendance.staffId)
          .get();

        if (staffDoc.exists) {
          const staffData = staffDoc.data()!;
          staffList.push({
            uid: attendance.staffId,
            fullName: staffData.fullName || '',
            fullNameKana: staffData.fullNameKana || '',
            position: staffData.position || 'スタッフ',
            hasShiftToday: false, // 退勤モードでは使用しない
            shiftStart: null,
            clockIn: attendance.clockIn?.toDate().toLocaleTimeString('ja-JP', { hour: 'numeric', minute: 'numeric' }), // HH:MM形式
            attendanceDocId: attendance.docId,
            closedStoreWithoutClockOut: attendance.closedStoreWithoutClockOut,
          });
        }
      }

      // かな順でソート
      staffList.sort((a, b) => a.fullNameKana.localeCompare(b.fullNameKana));
    }

    // 別枠用: closedStoreWithoutClockOut=false かつ clockOut=null（CHANGESPEC 6-4・退勤モード時のみ）
    let separateSectionStaff: Array<Record<string, unknown>> = [];
    if (!isClockInMode) {
      const separateSectionSnapshot = await admin.firestore()
        .collection('attendances')
        .where('closedStoreWithoutClockOut', '==', false)
        .where('clockOut', '==', null)
        .get();

      const mainDocIds = new Set(
        staffList.map((s: { attendanceDocId?: string }) => s.attendanceDocId).filter(Boolean) as string[]
      );
      for (const doc of separateSectionSnapshot.docs) {
        if (mainDocIds.has(doc.id)) continue; // 本リストと重複する場合はスキップ
        const d = doc.data();
        if (d.clockIn == null) continue;
        const staffDoc = await admin.firestore().collection('staffs').doc(d.staffId as string).get();
        if (!staffDoc.exists) continue;
        const staffData = staffDoc.data()!;
        separateSectionStaff.push({
          uid: d.staffId,
          fullName: staffData.fullName || '',
          fullNameKana: staffData.fullNameKana || '',
          position: staffData.position || 'スタッフ',
          attendanceDocId: doc.id,
          clockIn: (d.clockIn as admin.firestore.Timestamp)?.toDate?.()?.toLocaleTimeString?.('ja-JP', { hour: 'numeric', minute: 'numeric' }) ?? '—',
          date: d.date,
          closedStoreWithoutClockOut: false,
        });
      }
      separateSectionStaff.sort((a, b) => (a.fullNameKana as string).localeCompare(b.fullNameKana as string));
    }

    return {
      success: true,
      staffList: staffList as Array<{[key: string]: any}>,
      count: staffList.length,
      date: attendanceDate,
      attendanceDate,
      shiftDate,
      separateSectionStaff: separateSectionStaff as Array<{[key: string]: any}>,
    };

  } catch (error) {
    logOpsError({
      message: 'Error in getStaffListForAttendance:',
      failureType: 'business',
      functionEntry: 'getStaffListForAttendance',
      cause: error,
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
