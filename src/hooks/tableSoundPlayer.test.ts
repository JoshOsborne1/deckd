import { needsRewind, playSoundEffect, type ReplayablePlayer } from './tableSoundPlayer';

function fakePlayer(overrides: Partial<ReplayablePlayer> = {}): ReplayablePlayer & {
  seeks: number[];
  plays: number;
} {
  let currentTime = 0;
  return {
    currentTime,
    duration: 0,
    playing: false,
    seeks: [],
    plays: 0,
    seekTo(seconds: number) {
      currentTime = seconds;
      this.seeks.push(seconds);
      return Promise.resolve();
    },
    play() {
      this.plays += 1;
    },
    ...overrides,
  };
}

describe('needsRewind', () => {
  it('is false for a fresh player', () => {
    expect(needsRewind(fakePlayer({ duration: 0.16, currentTime: 0 }))).toBe(false);
  });

  it('is false mid-play', () => {
    expect(needsRewind(fakePlayer({ duration: 0.16, currentTime: 0.05 }))).toBe(false);
  });

  it('is true when the item finished (currentTime at duration)', () => {
    expect(needsRewind(fakePlayer({ duration: 0.16, currentTime: 0.16 }))).toBe(true);
  });

  it('is false when duration is unknown (not loaded yet)', () => {
    expect(needsRewind(fakePlayer({ duration: 0, currentTime: 0 }))).toBe(false);
  });
});

describe('playSoundEffect', () => {
  it('plays immediately for a fresh player', async () => {
    const player = fakePlayer({ duration: 0.16 });
    await playSoundEffect(player);
    expect(player.plays).toBe(1);
    expect(player.seeks).toEqual([]);
  });

  it('plays immediately mid-play', async () => {
    const player = fakePlayer({ duration: 0.16, currentTime: 0.07 });
    await playSoundEffect(player);
    expect(player.plays).toBe(1);
    expect(player.seeks).toEqual([]);
  });

  it('seeks to zero before replaying a finished sound (the native bug)', async () => {
    const player = fakePlayer({ duration: 0.16, currentTime: 0.16 });
    await playSoundEffect(player);
    expect(player.seeks).toEqual([0]);
    expect(player.plays).toBe(1);
  });

  it('plays as-is before the item is loaded', async () => {
    const player = fakePlayer({ duration: 0 });
    await playSoundEffect(player);
    expect(player.plays).toBe(1);
    expect(player.seeks).toEqual([]);
  });
});
