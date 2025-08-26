import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

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

    // 今日の日付を取得（JST）
    const today = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // 9時間をミリ秒で
    const todayJST = new Date(today.getTime() + jstOffset);
    const todayString = todayJST.toISOString().split('T')[0]; // YYYY-MM-DD

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

      // 当日のシフト情報を取得
      const shiftsSnapshot = await admin.firestore()
        .collection('shifts')
        .where('date', '==', todayString)
        .where('status', '==', 'approved')
        .get();

      const shifts = shiftsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          staffId: data.staffId || '',
          startTime: data.start || '',
        };
      });

      // スタッフにシフト情報を追加
      staffList = staffs.map(staff => {
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
      // 退勤モード：出勤済みで退勤していないスタッフを取得
      const attendancesSnapshot = await admin.firestore()
        .collection('attendances')
        .where('date', '==', todayString)
        .where('clockOut', '==', null)
        .get();

      const attendances = attendancesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          docId: doc.id,
          staffId: data.staffId || '',
          clockIn: data.clockIn,
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
          });
        }
      }

      // かな順でソート
      staffList.sort((a, b) => a.fullNameKana.localeCompare(b.fullNameKana));
    }

    // デバッグログ
    console.log('=== getStaffListForAttendance Debug Log ===');
    console.log('isClockInMode:', isClockInMode);
    console.log('todayString:', todayString);
    console.log('staffList length:', staffList.length);
    console.log('staffList sample:', JSON.stringify(staffList[0], null, 2));
    console.log('staffList types:', staffList.map(item => ({
      uid: typeof item.uid,
      fullName: typeof item.fullName,
      fullNameKana: typeof item.fullNameKana,
      position: typeof item.position,
      hasShiftToday: typeof item.hasShiftToday,
      shiftStart: typeof item.shiftStart,
    })));
    console.log('=== End Debug Log ===');

    return {
      success: true,
      staffList: staffList as Array<{[key: string]: any}>,
      count: staffList.length,
      date: todayString,
    };

  } catch (error) {
    console.error('Error in getStaffListForAttendance:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError(
      'internal',
      'Internal server error'
    );
  }
});
