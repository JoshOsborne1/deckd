import {
  CARD_FLIGHT_DEAL_STAGGER_MS,
  getCardFlightStyle,
  getDiscardArcRotation,
} from './cardFlight';

describe('card flight foundation', () => {
  it('uses the shared 40ms deal stagger', () => {
    expect(CARD_FLIGHT_DEAL_STAGGER_MS).toBe(40);
  });

  it('interpolates a flight between source and destination points', () => {
    expect(
      getCardFlightStyle(
        { x: 40, y: 80 },
        { x: 240, y: 320 },
        0.5,
        { arcHeight: 20, rotation: 0 },
      ),
    ).toEqual({ x: 140, y: 180, scale: 1, rotation: 0 });
  });

  it('adds a gentle upward arc for discard flights', () => {
    expect(
      getCardFlightStyle(
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        0.5,
        { arcHeight: 30, rotation: getDiscardArcRotation('right') },
      ),
    ).toEqual({ x: 50, y: 20, scale: 1, rotation: 10 });
  });

  it('keeps discard rotation inside the 8-12 degree brief', () => {
    expect(Math.abs(getDiscardArcRotation('left'))).toBe(10);
    expect(Math.abs(getDiscardArcRotation('right'))).toBe(10);
  });
});
