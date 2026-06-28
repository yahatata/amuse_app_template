import {
  buildRuntimeStagesFromBlindLevels,
} from '../../../src/shared/tournament/buildRuntimeStagesFromBlindLevels';

describe('buildRuntimeStagesFromBlindLevels', () => {
  it('smallBlind / bigBlind / ante を level stage の sb / bb / ante にコピーする', () => {
    const stages = buildRuntimeStagesFromBlindLevels(
      [
        {
          level: 1,
          duration: 20,
          smallBlind: 100,
          bigBlind: 200,
          ante: 200,
        },
      ],
      { lateRegUntilLev: 0, breakDurationMin: 10 }
    );

    expect(stages).toEqual([
      {
        type: 'level',
        lev: 1,
        durationSec: 1200,
        sb: 100,
        bb: 200,
        ante: 200,
      },
    ]);
  });

  it('ante が 0 でも欠落しない', () => {
    const stages = buildRuntimeStagesFromBlindLevels([
      {
        level: 2,
        duration: 15,
        smallBlind: 200,
        bigBlind: 400,
        ante: 0,
      },
    ]);

    expect(stages[0]).toMatchObject({
      type: 'level',
      lev: 2,
      sb: 200,
      bb: 400,
      ante: 0,
    });
  });

  it('break / regist stage には sb / bb / ante を付けない', () => {
    const stages = buildRuntimeStagesFromBlindLevels(
      [
        {
          level: 1,
          duration: 20,
          smallBlind: 100,
          bigBlind: 200,
          ante: 0,
          hasBreakAfter: true,
        },
        {
          level: 2,
          duration: 20,
          smallBlind: 200,
          bigBlind: 400,
          ante: 400,
        },
      ],
      { lateRegUntilLev: 1, breakDurationMin: 10 }
    );

    expect(stages).toHaveLength(4);
    expect(stages[0]).toMatchObject({ type: 'level', lev: 1, sb: 100, bb: 200 });
    expect(stages[1]).toEqual({ type: 'break', durationSec: 600 });
    expect(stages[2]).toEqual({ type: 'regist', durationSec: 0 });
    expect(stages[3]).toMatchObject({ type: 'level', lev: 2, sb: 200, bb: 400 });
    expect(stages[1]).not.toHaveProperty('sb');
    expect(stages[2]).not.toHaveProperty('sb');
  });

  it('smallBlind / bigBlind が数値でない場合は sb / bb を付けない', () => {
    const stages = buildRuntimeStagesFromBlindLevels([
      {
        level: 1,
        duration: 20,
        ante: 50,
      },
    ]);

    expect(stages[0]).toEqual({
      type: 'level',
      lev: 1,
      durationSec: 1200,
      ante: 50,
    });
  });
});
