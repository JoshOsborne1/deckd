import { getRulesGuide, RULES_GUIDES } from './rulesGuide';

describe('rules guides', () => {
  it('covers every built-in recipe with actionable copy', () => {
    expect(Object.keys(RULES_GUIDES)).toEqual([
      'freeplay',
      'deal-two-each',
      'war',
      'go-fish',
      'old-maid',
      'crazy-eights',
      'sevens',
      'klondike',
      'blackjack',
      'poker',
      'klondike',
      'freecell',
      'pyramid',
    ]);

    for (const guide of Object.values(RULES_GUIDES)) {
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.summary.length).toBeGreaterThan(0);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.win.length).toBeGreaterThan(0);
      expect(guide.tableNote.length).toBeGreaterThan(0);
    }
  });

  it('falls back to freeplay for an unknown recipe', () => {
    expect(getRulesGuide('not-a-real-recipe')).toBe(RULES_GUIDES.freeplay);
    expect(getRulesGuide(null).id).toBe('freeplay');
  });
});
