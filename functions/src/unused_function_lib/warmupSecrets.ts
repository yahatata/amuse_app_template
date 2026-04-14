/**
 * [UNUSED] warmupSecrets
 *
 * コールドスタート時に `line-config` を先読みするためのヘルパー。
 * リポジトリ内に呼び出し箇所はない（どの handler 先頭にも未配線）。
 *
 * `unused_function_lib` に置くことで logOps 走査対象外とする。
 * 将来ハンドラ先頭で使う場合はここから import する。
 */

import { logOpsError } from "../shared/logging/logOpsError";
import { getLineConfig } from "../shared/secrets/secretManager";

export function warmupSecrets(): void {
  void getLineConfig().catch((error) => {
    logOpsError({
      message: "warmupSecrets: failed to load line-config",
      functionEntry: "getLineConfig",
      operation: "warmupSecrets",
      cause: error,
      context: {
        secretName: "line-config",
      },
    });
  });
}
