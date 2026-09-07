/**
 * DualEndTable — one phone, two players, opposite ends (blueprint §8.3).
 *
 * The phone lies between two trusted players like a tiny physical table:
 * Player B's hand strip faces away at the top (rotated 180), the shared
 * deck/discard sit in the centre, Player A's strip sits at the bottom.
 * Each player presses and holds their own end to face their cards toward
 * themselves; releasing immediately re-veils to backs. Each end is an
 * independent touch domain, so both players can peek at once, and while
 * held a tap on a revealed card discards it into the shared centre.
 *
 * Honesty: hold-to-peek is shoulder-surf resistant, not secure. The surface
 * says so; the mode is for trusted, face-to-face play.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { FlipCard } from '@components/FlipCard';
import { PlayingCard } from '@components/PlayingCard';
import { ZoneWell } from '@components/ZoneWell';
import { TableShell } from '@components/table/TableShell';
import { useMotion } from '@hooks/useMotion';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import {
  parseCardId,
  parseJokerId,
  selectDiscardTopCard,
  selectDrawPileCount,
  selectDrawTopCardId,
  selectLocalHand,
  selectNextPlayerId,
} from '@engine/selectors';
import {
  ZONE_DISCARD,
  handZoneId,
  type CardId,
  type CardInstance,
  type PlayerId,
} from '@engine/types';
import { alpha, colors, fonts, fontSizes, letterSpacing, radii, space } from '@theme';

const HOLD_MS = 300;

interface DualEndTableProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

export function DualEndTable({ active, topInset, bottomInset }: DualEndTableProps) {
  const { haptic } = useMotion();
  const equippedBackId = useCosmeticsStore((s) => s.equippedBackId);
  const state = useGameStore((s) => s.state);
  const dealCard = useGameStore((s) => s.dealCard);
  const moveCard = useGameStore((s) => s.moveCard);
  const endTurn = useGameStore((s) => s.endTurn);
  const setViewMode = useUiStore((s) => s.setViewMode);

  const humanPlayers = useMemo(
    () => state.players.filter((p) => p.id !== 'house'),
    [state.players],
  );
  // Seat 0 owns the bottom end, seat 1 the rotated top end.
  const bottom = humanPlayers[0] ?? null;
  const top = humanPlayers[1] ?? null;
  const house = state.players.find((p) => p.id === 'house') ?? null;

  const handFor = useCallback(
    (playerId: PlayerId | undefined) => (playerId ? selectLocalHand(state, playerId) : []),
    [state],
  );
  const houseHand = useMemo(
    () => (house ? selectLocalHand(state, house.id) : []),
    [state, house],
  );
  const drawCount = useMemo(() => selectDrawPileCount(state), [state]);
  const discardTop = useMemo(() => selectDiscardTopCard(state), [state]);
  const nextPlayerId = useMemo(() => selectNextPlayerId(state), [state]);

  // The shared deck serves whoever's turn it is; the physical pile simply
  // sits on the centre line between the two ends.
  const handleDraw = useCallback(() => {
    const playerId = state.currentPlayerId;
    if (!playerId || playerId === 'house') return;
    const topCardId = selectDrawTopCardId(state);
    if (!topCardId) return;
    haptic('medium');
    dealCard(topCardId, handZoneId(playerId), 'up');
  }, [state, haptic, dealCard]);

  const handleDiscard = useCallback(
    (cardId: CardId, owner: PlayerId) => {
      if (owner !== state.currentPlayerId) return;
      haptic('medium');
      moveCard(cardId, ZONE_DISCARD, 'up');
    },
    [state.currentPlayerId, haptic, moveCard],
  );

  const handlePassTurn = useCallback(() => {
    if (!state.currentPlayerId || !nextPlayerId) return;
    const next = state.players.find((p) => p.id === nextPlayerId);
    if (!next || next.id === 'house') return;
    // Dual-end never hands the device over: end the turn and the other
    // player's end lights up. The veil flow stays in classic pass mode.
    haptic('success');
    endTurn(state.currentPlayerId);
  }, [state.currentPlayerId, state.players, nextPlayerId, haptic, endTurn]);

  const handleBackToHub = useCallback(() => {
    haptic('light');
    setViewMode('hub');
  }, [haptic, setViewMode]);

  const tableTitle = (state.config.presetId ?? 'table').replace(/-/g, ' ').toUpperCase();
  const activePlayer = state.players.find((p) => p.id === state.currentPlayerId);
  const turnLabel = activePlayer
    ? `${activePlayer.name.toUpperCase()} · TO PLAY`
    : undefined;

  const discardParsed = discardTop ? parseCardId(discardTop.id) : null;
  const discardJoker = discardTop ? parseJokerId(discardTop.id) : null;

  return (
    <TableShell
      title={tableTitle}
      active={active}
      turnLabel={turnLabel}
      onBackToHub={handleBackToHub}
      topInset={topInset}
      bottomInset={bottomInset}
    >
      <View style={styles.root}>
        {/* Top player (B): rotated 180 so it reads correctly from the far end. */}
        {top && (
          <EndStrip
            player={top}
            cards={handFor(top.id)}
            rotated
            isTurn={state.currentPlayerId === top.id}
            onDiscard={handleDiscard}
            backId={equippedBackId}
            haptic={haptic}
          />
        )}

        {/* Shared centre: house readout, deck, discard, honesty line. */}
        <View style={styles.centre}>
          {house && (
            <Text style={styles.houseLabel} accessibilityLabel={`House holds ${houseHand.length} cards`}>
              HOUSE · {houseHand.length}
            </Text>
          )}
          <View style={styles.pilesRow}>
            <Pressable
              onPress={handleDraw}
              disabled={drawCount === 0 || state.phase !== 'playing'}
              accessibilityRole="button"
              accessibilityLabel={`Draw pile, ${drawCount} cards left`}
              style={[
                styles.deckTrigger,
                (drawCount === 0 || state.phase !== 'playing') && styles.dimmed,
              ]}
            >
              <PlayingCard face="down" size="md" back={equippedBackId} />
              <Text style={styles.deckLeftText}>{drawCount} LEFT</Text>
            </Pressable>

            {discardTop ? (
              <FlipCard
                rank={discardParsed?.rank}
                suit={discardParsed?.suit}
                jokerColor={discardJoker ?? undefined}
                face={discardTop.face}
                size="md"
                elevated
              />
            ) : (
              <ZoneWell width={90} height={126} label="DISCARD" />
            )}
          </View>
          <Text style={styles.honesty}>HOLD YOUR END TO PEEK · SHOULDER-SURF RESISTANT · NOT SECURE</Text>
        </View>

        {/* Bottom player (A). */}
        {bottom && (
          <EndStrip
            player={bottom}
            cards={handFor(bottom.id)}
            rotated={false}
            isTurn={state.currentPlayerId === bottom.id}
            onDiscard={handleDiscard}
            backId={equippedBackId}
            haptic={haptic}
          />
        )}

        {/* Turn control on the centre line so neither end owns it. */}
        <View style={styles.actionRow}>
          {state.phase === 'playing' ? (
            <CardButton
              variant="primary"
              size="sm"
              haptic="medium"
              onPress={handlePassTurn}
              style={styles.passBtn}
              innerStyle={styles.passBtnInner}
            >
              <Text style={styles.passBtnText}>PASS TURN »</Text>
            </CardButton>
          ) : state.phase === 'ended' ? (
            <CardButton
              variant="primary"
              size="sm"
              haptic="medium"
              onPress={handleBackToHub}
              style={styles.passBtn}
              innerStyle={styles.passBtnInner}
            >
              <Text style={styles.passBtnText}>BACK TO SETUP</Text>
            </CardButton>
          ) : null}
        </View>
      </View>
    </TableShell>
  );
}

interface EndStripProps {
  player: { id: PlayerId; name: string; avatarSeed: string };
  cards: CardInstance[];
  rotated: boolean;
  isTurn: boolean;
  onDiscard: (cardId: CardId, owner: PlayerId) => void;
  backId: string;
  haptic: (intensity?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'success' | 'warn' | 'error' | 'select') => void;
}

/**
 * One player's end of the board. Press and hold the strip to face your own
 * cards; release re-veils to backs (`onPressOut` always fires, so the hand
 * can never stay exposed). While held, a tap on a revealed card discards it
 * — on a real phone that is a second finger while the first keeps the hold.
 *
 * RN's Pressable drives the gesture (not RNGH) so web and native fire the
 * long-press at `delayLongPress` mid-hold, which is exactly the §8.3
 * "press and holds their end" behaviour this surface owes.
 */
function EndStrip({
  player,
  cards,
  rotated,
  isTurn,
  onDiscard,
  backId,
  haptic,
}: EndStripProps) {
  const [peeked, setPeeked] = useState(false);

  const handleCardTap = useCallback(
    (cardId: CardId) => {
      // Cards are only pressable while revealed; the strip hold keeps the
      // hand exposed and a tap plays the card into the shared centre.
      haptic('medium');
      onDiscard(cardId, player.id);
    },
    [haptic, onDiscard, player.id],
  );

  return (
    <Pressable
      delayLongPress={HOLD_MS}
      onPressIn={() => haptic('light')}
      onLongPress={() => {
        setPeeked(true);
        haptic('success');
      }}
      onPressOut={() => setPeeked(false)}
      style={[
        styles.endStrip,
        rotated && styles.endStripRotated,
        isTurn && styles.endStripTurn,
        peeked && styles.endStripPeeked,
      ]}
    >
      <View style={styles.seatRow}>
        <AvatarPlaceholder
          seed={player.avatarSeed}
          label={player.name}
          size={22}
          ring={isTurn ? 'brand' : 'none'}
        />
        <Text style={[styles.seatName, isTurn && styles.seatNameTurn]} numberOfLines={1}>
          {player.name.toUpperCase()}
        </Text>
        <Text style={styles.seatCount}>{cards.length === 1 ? '1 CARD' : `${cards.length} CARDS`}</Text>
      </View>

      <View style={styles.cardRow}>
        {cards.length === 0 ? (
          <Text style={styles.emptyHand}>NO CARDS · DRAW FROM THE DECK</Text>
        ) : (
          cards.map((card) => (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={cardLabel(card, peeked)}
              accessibilityHint={peeked ? 'Tap to discard this card into the centre.' : undefined}
              disabled={!peeked}
              onPress={() => handleCardTap(card.id)}
              style={({ pressed }) => [styles.stripCard, pressed && styles.stripCardPressed]}
            >
              <StripCard card={card} revealed={peeked} backId={backId} />
            </Pressable>
          ))
        )}
      </View>

      <Text style={styles.holdHint}>
        {peeked ? 'RELEASE TO RE-VEIL · TAP A CARD TO DISCARD' : 'HOLD TO PEEK YOUR HAND'}
      </Text>
    </Pressable>
  );
}

function cardLabel(card: CardInstance, revealed: boolean): string {
  if (!revealed) return 'Face-down card';
  const parsed = parseCardId(card.id);
  const joker = parseJokerId(card.id);
  if (parsed) return `${parsed.rank} of ${parsed.suit}`;
  if (joker) return `${joker} joker`;
  return 'Face-down card';
}

interface StripCardProps {
  card: CardInstance;
  revealed: boolean;
  backId: string;
}

/**
 * One card in an end strip: FlipCard swaps back <-> face with the peek.
 * While held, the owner sees their whole private hand — the same view the
 * classic hand fan gives the active player. Rank/suit never ship to the
 * DOM while veiled, so hidden cards stay honest even in the AX tree.
 */
function StripCard({ card, revealed, backId }: StripCardProps) {
  const parsed = parseCardId(card.id);
  const joker = parseJokerId(card.id);
  return (
    <FlipCard
      face={revealed ? 'up' : 'down'}
      rank={revealed ? parsed?.rank : undefined}
      suit={revealed ? parsed?.suit : undefined}
      jokerColor={revealed ? joker ?? undefined : undefined}
      back={backId}
      size="sm"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
  },
  endStrip: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  endStripRotated: {
    transform: [{ rotate: '180deg' }],
  },
  endStripTurn: {
    borderColor: alpha.brand30,
  },
  endStripPeeked: {
    backgroundColor: alpha.brand10,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  seatName: {
    flex: 1,
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  seatNameTurn: {
    color: colors.brand,
  },
  seatCount: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 92,
  },
  emptyHand: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
  },
  holdHint: {
    marginTop: space.xs,
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
  },
  stripCard: {
    marginHorizontal: -8,
  },
  stripCardPressed: {
    opacity: 0.85,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    minHeight: 150,
  },
  houseLabel: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  pilesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
  },
  deckTrigger: {
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
  deckLeftText: {
    marginTop: -16,
    color: colors.surface,
    fontSize: 10,
    fontFamily: fonts.bold,
    backgroundColor: colors.brand,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
    overflow: 'hidden',
    letterSpacing: letterSpacing.cap,
  },
  honesty: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    textAlign: 'center',
  },
  actionRow: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  passBtn: {
    minWidth: 180,
  },
  passBtnInner: {
    paddingVertical: space.sm + 2,
  },
  passBtnText: {
    color: colors.surface,
    fontSize: fontSizes.small,
    fontFamily: fonts.bold,
    letterSpacing: letterSpacing.cap,
  },
});

export default DualEndTable;