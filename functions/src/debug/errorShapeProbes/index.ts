/**
 * errorShapeProbe: Google 系 API / SDK のエラーオブジェクト shape 観察用 Callable。
 * 本番業務導線とは分離。呼び出しは devices.role === admin のみ。
 */
export { probeFirestoreErrorShape } from './probeFirestore';
export { probeFirestoreErrorShapeInvalidArgument } from './probeFirestoreInvalidArgument';
export { probeAuthErrorShape } from './probeAuth';
export { probeStorageErrorShape } from './probeStorage';
export { probeCloudTasksErrorShape } from './probeCloudTasks';
