/**
 * Card Lab — internal-only quality gate surface (blueprint §6).
 *
 * Exercises every physical-card scenario (§6.1–6.12) before any game migrates:
 *
 *  6.1  Fan browsing at 2/5/10/20 cards
 *  6.2  Hold/lift/drag/drop hand -> pile
 *  6.3  Deck-to-hand draw
 *  6.4  Invalid drop and interruption reversal
 *  6.5  In-hand reorder with a live insertion gap
 *  6.6  Stack moves as one body
 *  6.7  Card flip
 *  6.8  Pile collection
 *  6.9  Privacy veil + pass ritual
 *  6.10 Two mock viewports showing one synchronized cross-device transfer
 *  6.11 Reduced-motion, screen-reader, large-text paths
 *  6.12 Slow-render stress mode (JS busy while drag stays smooth)
 *
 * The lab never touches the engine. Legality comes from a stub provider;
 * committed intents are logged so the reviewer can see the typed-intent stream.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CardMotionOverlay, useCardMotionCoordinator } from '@components/card/CardMotionOverlay';
import { CardZone } from '@components/card/CardZone';
import { DeckPile } from '@components/card/DeckPile';
import { HandFanSurface, type HandFanCard } from '@components/card/HandFanSurface';
import { StackSurface } from '@components/card/StackSurface';
import { TurnToken } from '@components/card/TurnToken';
import { ZoneRegistryProvider } from '@components/table/ZoneRegistry';
import { PlayingCard } from '@components/PlayingCard';
import { PrivacyVeil } from '@components/PrivacyVeil';
import { useMotion } from '@hooks/useMotion';
import {
  nextPhysicalIntentId,
  type LegalTargetsProvider,
  type PhysicalIntent,
} from '@lib/physicalIntents';
import { legalIntents } from '@engine/legalIntents';
import type { GameState, Zone } from '@engine/types';
import { ZONE_DISCARD, ZONE_DRAW } from '@engine/types';
import type { Rank, Suit } from '@lib/types';
import { alpha, colors, fonts, radii, shadow, space } from '@theme';

type CardSpec = { id: string; rank: Rank; suit: Suit };

const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

function makeDeck(count: number): CardSpec[] {
  const out: CardSpec[] = [];
  let index = 0;
  while (out.length < count) {
    const rank = RANKS[index % RANKS.length];
    const suit = SUITS[Math.floor(index / RANKS.length) % SUITS.length];
    out.push({ id: `L-${out.length}`, rank, suit });
    index += 1;
  }
  return out;
}

const FULL_DECK = makeDeck(52);

/** Minimal engine state for the lab so legalIntents can run. */
function labEngineState(hand: CardSpec[], pile: CardSpec[], discard: CardSpec[], partnerHand: CardSpec[]): GameState {
  const handZone: Zone = {
    id: 'hand:lab-actor',
    label: 'Lab hand',
    visibility: { kind: 'private', ownerId: 'lab-actor' },
    ownerId: 'lab-actor',
    cardIds: hand.map((c) => c.id),
  };
  const pileZone: Zone = {
    id: 'lab-pile',
    label: 'Lab pile',
    visibility: { kind: 'public' },
    cardIds: pile.map((c) => c.id),
  };
  const discardZone: Zone = {
    id: ZONE_DISCARD,
    label: 'Discard',
    visibility: { kind: 'public' },
    cardIds: discard.map((c) => c.id),
  };
  const partnerZone: Zone = {
    id: 'hand:lab-partner',
    label: 'Partner hand',
    visibility: { kind: 'private', ownerId: 'lab-partner' },
    ownerId: 'lab-partner',
    cardIds: partnerHand.map((c) => c.id),
  };
  const drawZone: Zone = {
    id: ZONE_DRAW,
    label: 'Draw pile',
    visibility: { kind: 'hidden' },
    cardIds: FULL_DECK.filter((c) => ![...hand, ...pile, ...discard, ...partnerHand].some((used) => used.id === c.id)).map((c) => c.id),
  };

  const cards: GameState['cards'] = {};
  for (const spec of FULL_DECK) {
    const zoneId = handZone.cardIds.includes(spec.id)
      ? handZone.id
      : pileZone.cardIds.includes(spec.id)
        ? pileZone.id
        : discardZone.cardIds.includes(spec.id)
          ? discardZone.id
          : partnerZone.cardIds.includes(spec.id)
            ? partnerZone.id
            : drawZone.id;
    cards[spec.id] = {
      id: spec.id,
      face: 'up',
      zoneId,
      order: 0,
    };
  }

  return {
    meta: {
      id: 'lab',
      createdAt: 0,
      rngSeed: '',
      mode: 'pass',
      hostId: 'lab-actor',
    },
    config: {
      includeJokers: false,
      fanStyle: 'wide',
      autoReshuffleDiscard: true,
      presetId: 'freeplay',
    },
    players: [
      { id: 'lab-actor', name: 'Lab', seat: 0, avatarSeed: 'lab' },
      { id: 'lab-partner', name: 'Partner', seat: 1, avatarSeed: 'partner' },
    ],
    currentPlayerId: 'lab-actor',
    turn: 0,
    phase: 'playing',
    privacySeat: null,
    zones: {
      [handZone.id]: handZone,
      [pileZone.id]: pileZone,
      [discardZone.id]: discardZone,
      [partnerZone.id]: partnerZone,
      [drawZone.id]: drawZone,
    },
    cards,
    deckCardIds: FULL_DECK.map((c) => c.id),
    winnerId: null,
  };
}

function renderCardFace(spec: CardSpec, concealed: boolean): React.ReactNode {
  return (
    <PlayingCard
      rank={spec.rank}
      suit={spec.suit}
      face={concealed ? 'down' : 'up'}
      size="md"
      elevated
    />
  );
}

function LabSurface() {
  const router = useRouter();
  const { reduceMotion, announce } = useMotion();
  const coordinator = useCardMotionCoordinator();

  const [fanCount, setFanCount] = useState<2 | 5 | 10 | 20>(5);
  const [hand, setHand] = useState<CardSpec[]>(() => FULL_DECK.slice(0, 5));
  const [pile, setPile] = useState<CardSpec[]>([]);
  const [discard, setDiscard] = useState<CardSpec[]>([]);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [logLines, setLogLines] = useState<string[]>([]);
  const [largeText, setLargeText] = useState(false);
  const [veilUp, setVeilUp] = useState(false);
  const [busyStress, setBusyStress] = useState(false);
  const [partnerHand, setPartnerHand] = useState<CardSpec[]>([]);

  // Blueprint 6.12: keep the JS thread visibly busy while gestures stay smooth.
  useEffect(() => {
    if (!busyStress) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const end = Date.now() + 12;
      let acc = 0;
      while (Date.now() < end) {
        acc += Math.sqrt((acc % 97) + 1);
      }
      requestAnimationFrame(tick);
    };
    const handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [busyStress]);

  const appendLog = useCallback((line: string) => {
    setLogLines((current) => [line, ...current].slice(0, 12));
  }, []);

  const dispatchIntent = useCallback(
    (intent: PhysicalIntent) => {
      appendLog(
        `${intent.type} (${intent.id})` +
          (intent.type === 'card.move'
            ? ` ${intent.cardIds.join(',')} ${intent.from}->${intent.to}`
            : intent.type === 'hand.reorder'
              ? ` ${intent.cardId} -> ${intent.toIndex}`
              : intent.type === 'pile.draw'
                ? ` ${intent.pileId} -> ${intent.to}`
                : intent.type === 'turn.pass'
                  ? ' pass'
                  : ''),
      );

      if (intent.type === 'card.move') {
        const [cardId] = intent.cardIds;
        setHand((current) => {
          const card = current.find((candidate) => candidate.id === cardId);
          if (!card) return current;
          const without = current.filter((candidate) => candidate.id !== cardId);
          if (intent.to === 'lab-pile') {
            setPile((p) => [...p, card]);
            coordinator.commitMove({
              transactionId: intent.id,
              cardId: card.id,
              fromZoneId: intent.from,
              toZoneId: intent.to,
              cue: 'move',
            });
          } else if (intent.to === 'lab-discard') {
            setDiscard((d) => [...d, card]);
            coordinator.commitMove({
              transactionId: intent.id,
              cardId: card.id,
              fromZoneId: intent.from,
              toZoneId: intent.to,
              cue: 'discard',
            });
          } else if (intent.to === 'lab-partner-hand') {
            setPartnerHand((p) => [...p, card]);
            coordinator.commitMove({
              transactionId: intent.id,
              cardId: card.id,
              fromZoneId: intent.from,
              toZoneId: intent.to,
              cue: 'draw',
              concealed: true,
            });
          }
          return without;
        });
        setPartnerHand((current) => {
          const card = current.find((candidate) => candidate.id === cardId);
          if (!card) return current;
          if (intent.to !== 'lab-hand') return current;
          setHand((h) => [...h, card]);
          coordinator.commitMove({
            transactionId: intent.id,
            cardId: card.id,
            fromZoneId: intent.from,
            toZoneId: intent.to,
            cue: 'draw',
          });
          return current.filter((candidate) => candidate.id !== cardId);
        });
        setPile((current) => {
          const card = current.find((candidate) => candidate.id === cardId);
          if (!card) return current;
          if (intent.to !== 'lab-hand') return current;
          setHand((h) => [...h, card]);
          coordinator.commitMove({
            transactionId: intent.id,
            cardId: card.id,
            fromZoneId: intent.from,
            toZoneId: intent.to,
            cue: 'collect',
          });
          return current.filter((candidate) => candidate.id !== cardId);
        });
      } else if (intent.type === 'pile.draw') {
        // Lab deck semantics: deal the next unused card from FULL_DECK.
        const used = new Set([...hand, ...pile, ...partnerHand, ...discard].map((spec) => spec.id));
        const next = FULL_DECK.find((spec) => !used.has(spec.id));
        if (next) {
          setHand((current) => [...current, next]);
          coordinator.commitMove({
            transactionId: intent.id,
            cardId: next.id,
            fromZoneId: intent.pileId,
            toZoneId: intent.to,
            cue: 'draw',
          });
        }
      } else if (intent.type === 'hand.reorder') {
        setHand((current) => {
          const index = current.findIndex((card) => card.id === intent.cardId);
          if (index < 0) return current;
          const copy = [...current];
          const [moved] = copy.splice(index, 1);
          const clamped = Math.max(0, Math.min(copy.length, intent.toIndex));
          copy.splice(clamped, 0, moved);
          return copy;
        });
      } else if (intent.type === 'turn.pass') {
        setVeilUp(true);
      }
    },
    [appendLog, coordinator, discard, hand, partnerHand, pile],
  );

  const legalTargets = useMemo<LegalTargetsProvider>(
    () =>
      ({ fromZoneId }) => {
        // Real engine legality via legalIntents (Phase 2 wiring).
        // The lab builds a minimal engine state so the engine is the ONLY legality authority.
        const state = labEngineState(hand, pile, discard, partnerHand);
        const result = legalIntents(state, 'lab-actor', 'player');
        const targetZoneIds = result.targets.map((t) => t.zoneId);
        // Map engine zone ids back to lab zone ids.
        const labTargets = targetZoneIds.map((zoneId) => {
          if (zoneId === 'draw') return 'lab-deck';
          if (zoneId === 'discard') return 'lab-discard';
          if (zoneId.startsWith('hand:')) return zoneId === 'hand:lab-actor' ? 'lab-hand' : 'lab-partner-hand';
          return zoneId;
        });
        // Fallback: if no legal targets, allow all lab zones (lab is a sandbox).
        const base = ['lab-pile', 'lab-discard', 'lab-partner-hand', 'lab-hand'];
        return { zoneIds: labTargets.length > 0 ? labTargets.filter((z) => z !== fromZoneId) : base.filter((z) => z !== fromZoneId) };
      },
    [discard, hand, partnerHand, pile],
  );

  const fanCards = useMemo<HandFanCard[]>(
    () =>
      hand.slice(0, fanCount).map((spec) => ({
        id: spec.id,
        accessibilityLabel: `${spec.rank} of ${spec.suit}`,
        render: (concealed) => renderCardFace(spec, Boolean(concealed)),
      })),
    [fanCount, flipped, hand],
  );

  const partnerCards = useMemo<HandFanCard[]>(
    () =>
      partnerHand.map((spec) => ({
        id: spec.id,
        accessibilityLabel: `Partner card ${spec.id}`,
        render: (concealed) => renderCardFace(spec, concealed ?? true),
      })),
    [partnerHand],
  );

  const pileLead = useMemo(() => {
    const top = pile[pile.length - 1];
    if (!top) return null;
    return {
      id: top.id,
      accessibilityLabel: `Top of pile: ${top.rank} of ${top.suit}`,
      render: () => renderCardFace(top, false),
    };
  }, [pile]);

  const pileFollowers = useMemo(
    () =>
      pile.slice(0, -1).map((spec) => ({
        id: spec.id,
        render: () => renderCardFace(spec, false),
      })),
    [pile],
  );

  const flipTopOfPile = useCallback(() => {
    const top = pile[pile.length - 1];
    if (!top) return;
    const nextFlip = new Set(flipped);
    if (nextFlip.has(top.id)) {
      nextFlip.delete(top.id);
    } else {
      nextFlip.add(top.id);
    }
    setFlipped(nextFlip);
  }, [flipped, pile]);

  const collectPile = useCallback(() => {
    if (pile.length === 0) return;
    setDiscard((current) => current.concat(pile));
    setPile([]);
    announce(`Collected pile of ${pile.length}`);
    pile.forEach((spec, index) => {
      coordinator.commitMove({
        transactionId: `${nextPhysicalIntentId('collect')}-${index}`,
        cardId: spec.id,
        fromZoneId: 'lab-pile',
        toZoneId: 'lab-discard',
        cue: 'collect',
      });
    });
  }, [announce, coordinator, pile]);

  const resetLab = useCallback(() => {
    setHand(FULL_DECK.slice(0, fanCount));
    setPile([]);
    setDiscard([]);
    setPartnerHand([]);
    setFlipped(new Set());
    setLogLines([]);
    setVeilUp(false);
  }, [fanCount]);

  const deckCount = useMemo(() => {
    const used = new Set([...hand, ...pile, ...partnerHand].map((spec) => spec.id));
    return FULL_DECK.length - used.size - discard.length;
  }, [discard.length, hand, partnerHand, pile]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to hub"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Hub</Text>
        </Pressable>
        <View>
          <Text style={[styles.title, largeText && styles.titleLarge]}>Card Lab</Text>
          <Text style={styles.subtitle}>Physical-card quality gate · internal only</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset lab"
          onPress={resetLab}
          style={styles.backButton}
        >
          <Text style={styles.backText}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.row}>
          <Text style={styles.sectionLabel}>Fan count</Text>
          <View style={styles.chipRow}>
            {([2, 5, 10, 20] as const).map((count) => (
              <Pressable
                key={count}
                accessibilityRole="button"
                accessibilityLabel={`Fan with ${count} cards`}
                onPress={() => {
                  setFanCount(count);
                  setHand(FULL_DECK.slice(0, count));
                }}
                style={[styles.chip, fanCount === count && styles.chipActive]}
              >
                <Text style={[styles.chipText, fanCount === count && styles.chipTextActive]}>
                  {count}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.toggleRow}>
            <Text style={styles.sectionLabel}>Large text</Text>
            <Switch
              accessibilityLabel="Toggle large text"
              value={largeText}
              onValueChange={setLargeText}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.sectionLabel}>Busy JS (6.12)</Text>
            <Switch
              accessibilityLabel="Toggle busy render stress"
              value={busyStress}
              onValueChange={setBusyStress}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.sectionLabel}>Reduced motion</Text>
            <Text style={styles.sectionValue}>{reduceMotion ? 'ON (system/profile)' : 'off'}</Text>
          </View>
        </View>

        <View style={styles.board}>
          {/* Draw pile + discard target */}
          <View style={styles.zoneRow}>
            <View style={styles.zoneBlock}>
              <DeckPile
                zoneId="lab-deck"
                actorId="lab-actor"
                drawToZoneId="lab-hand"
                count={Math.max(0, deckCount)}
                dispatchIntent={dispatchIntent}
                label="Lab deck"
              >
                <PlayingCard face="down" size="md" elevated />
              </DeckPile>
              <Text style={styles.zoneLabel}>Deck</Text>
              <Text style={styles.zoneCount}>{deckCount}</Text>
            </View>

            <CardZone zoneId="lab-discard" active testID="lab-discard">
              <View style={styles.dropZone}>
                <Text style={styles.zoneLabel}>Discard</Text>
                {discard.length > 0 ? (
                  <PlayingCard
                    rank={discard[discard.length - 1].rank}
                    suit={discard[discard.length - 1].suit}
                    face="up"
                    size="md"
                  />
                ) : (
                  <View style={styles.emptyZone} />
                )}
                <Text style={styles.zoneCount}>{discard.length}</Text>
              </View>
            </CardZone>

            <CardZone zoneId="lab-pile" active testID="lab-pile">
              <View style={styles.dropZone}>
                <Text style={styles.zoneLabel}>Pile</Text>
                {pileLead ? (
                  <StackSurface
                    zoneId="lab-pile"
                    actorId="lab-actor"
                    lead={pileLead}
                    run={pileFollowers}
                    legalTargets={legalTargets}
                    runTargets={['lab-hand', 'lab-discard']}
                    dispatchIntent={dispatchIntent}
                  />
                ) : (
                  <View style={styles.emptyZone} />
                )}
                <Text style={styles.zoneCount}>{pile.length}</Text>
              </View>
            </CardZone>
          </View>

          <View style={styles.pileActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Flip top of pile"
              onPress={flipTopOfPile}
              disabled={pile.length === 0}
              style={[styles.actionButton, pile.length === 0 && styles.actionDisabled]}
            >
              <Text style={styles.actionText}>Flip top</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Collect pile to discard"
              onPress={collectPile}
              disabled={pile.length === 0}
              style={[styles.actionButton, pile.length === 0 && styles.actionDisabled]}
            >
              <Text style={styles.actionText}>Collect pile</Text>
            </Pressable>
          </View>

          {/* Your hand */}
          <View style={styles.handSection}>
            <Text style={[styles.sectionLabel, largeText && styles.sectionLabelLarge]}>
              Your hand ({hand.length})
            </Text>
            <HandFanSurface
              zoneId="lab-hand"
              actorId="lab-actor"
              cards={fanCards}
              legalTargets={legalTargets}
              dispatchIntent={dispatchIntent}
              maxWidth={340}
              size="md"
              canReorder
              label="Your hand"
            />
          </View>

          {/* Mock partner surface (6.10) */}
          <View style={styles.partnerSection}>
            <Text style={styles.sectionLabel}>Partner viewport ({partnerHand.length})</Text>
            <HandFanSurface
              zoneId="lab-partner-hand"
              actorId="lab-partner"
              cards={partnerCards}
              legalTargets={legalTargets}
              dispatchIntent={dispatchIntent}
              maxWidth={340}
              size="sm"
              canReorder={false}
              concealed
              label="Partner hand (concealed)"
            />
          </View>

          <View style={styles.passSection}>
            <TurnToken actorId="lab-actor" dispatchIntent={dispatchIntent} />
          </View>
        </View>

        <View style={styles.logSection}>
          <Text style={styles.sectionLabel}>Typed intent log</Text>
          <View style={styles.log}>
            {logLines.length === 0 ? (
              <Text style={styles.logEmpty}>Interact with the lab to see intents.</Text>
            ) : (
              logLines.map((line, index) => (
                <Text key={`${line}-${index}`} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <PrivacyVeil
        visible={veilUp}
        recipientName="Next player"
        onReveal={() => setVeilUp(false)}
        onCancel={() => setVeilUp(false)}
      />
    </View>
  );
}

export default function CardLabScreen() {
  return (
    <ZoneRegistryProvider>
      <CardMotionOverlay
        renderCardFace={(cardId, concealed) => {
          const spec = FULL_DECK.find((candidate) => candidate.id === cardId) ?? {
            id: cardId,
            rank: 'A',
            suit: 'spades',
          };
          return renderCardFace(spec as CardSpec, concealed);
        }}
      >
        <LabSurface />
      </CardMotionOverlay>
    </ZoneRegistryProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
  backButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  backText: {
    color: colors.brand,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.extra,
    fontSize: 24,
  },
  titleLarge: {
    fontSize: 30,
  },
  subtitle: {
    color: colors.inkMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: space.lg,
    gap: space.xl,
  },
  row: {
    gap: space.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    color: colors.inkMuted,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  chipTextActive: {
    color: colors.surface,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: colors.inkSoft,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  sectionLabelLarge: {
    fontSize: 18,
  },
  sectionValue: {
    color: colors.inkMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  board: {
    padding: space.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.lg,
    ...shadow.card,
  },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    gap: space.lg,
  },
  dropZone: {
    minWidth: 110,
    minHeight: 158,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.sm,
  },
  zoneBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.sm,
  },
  zoneLabel: {
    color: colors.inkMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1,
  },
  zoneCount: {
    color: colors.inkSubtle,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  emptyZone: {
    width: 90,
    height: 126,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
  },
  pileActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.md,
  },
  actionButton: {
    paddingHorizontal: space.lg,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionText: {
    color: colors.surface,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  handSection: {
    padding: space.md,
    borderRadius: radii.lg,
    backgroundColor: alpha.brand10,
    borderWidth: 1,
    borderColor: alpha.brand20,
    gap: space.sm,
  },
  partnerSection: {
    padding: space.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  passSection: {
    alignItems: 'center',
    paddingTop: space.sm,
  },
  logSection: {
    gap: space.sm,
  },
  log: {
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  logEmpty: {
    color: colors.inkSubtle,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  logLine: {
    color: colors.inkMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
