/**
 * 管理者向け logOpsError 検証用 Callable（本番業務導線とは分離）。
 * 呼び出しは devices.role === admin のみ。
 */
export { emitLogOpsErrorSamples } from './emitLogOpsErrorSamples';
export { emitLogOpsErrorRealSdkSamples } from './emitLogOpsErrorRealSdkSamples';
export {
  emitThrowOnlyTc01NotFound,
  enqueueThrowOnlyTc06WeeklyPlannerTask,
} from './emitThrowOnlyObservationProbes';
