export type RuntimeStageType = 'level' | 'break' | 'regist';

export interface RuntimeStage {
  type: RuntimeStageType;
  lev?: number;
  durationSec: number;
  sb?: number;
  bb?: number;
  ante?: number;
}

export interface BlindTemplateLevelInput {
  level: number;
  duration?: number;
  smallBlind?: number;
  bigBlind?: number;
  ante?: number;
  hasBreakAfter?: boolean;
}

export interface BuildRuntimeStagesOptions {
  lateRegUntilLev?: number;
  /** blindTemplates.breakDuration（分） */
  breakDurationMin?: number;
}

function levelStageFromBlindLevel(level: BlindTemplateLevelInput): RuntimeStage {
  const stage: RuntimeStage = {
    type: 'level',
    lev: level.level,
    durationSec: (level.duration ?? 0) * 60,
  };

  if (typeof level.smallBlind === 'number') {
    stage.sb = level.smallBlind;
  }
  if (typeof level.bigBlind === 'number') {
    stage.bb = level.bigBlind;
  }
  if (typeof level.ante === 'number') {
    stage.ante = level.ante;
  }

  return stage;
}

/**
 * blindTemplates.levels から views/runtime.stages を構築する。
 * level stage のみ smallBlind/bigBlind/ante → sb/bb/ante に変換する。
 */
export function buildRuntimeStagesFromBlindLevels(
  levels: BlindTemplateLevelInput[],
  options: BuildRuntimeStagesOptions = {}
): RuntimeStage[] {
  const lateRegUntilLev = options.lateRegUntilLev ?? 0;
  const breakDurationSec = (options.breakDurationMin ?? 0) * 60;

  let stages: RuntimeStage[] = levels.flatMap((level) => {
    const levelStage = levelStageFromBlindLevel(level);
    if (level.hasBreakAfter) {
      return [
        levelStage,
        { type: 'break' as const, durationSec: breakDurationSec },
      ];
    }
    return [levelStage];
  });

  if (lateRegUntilLev > 0) {
    const withRegist: RuntimeStage[] = [];
    for (const stage of stages) {
      if (stage.type === 'level' && stage.lev === lateRegUntilLev + 1) {
        withRegist.push({ type: 'regist', durationSec: 0 });
      }
      withRegist.push(stage);
    }
    stages = withRegist;
  }

  return stages;
}
