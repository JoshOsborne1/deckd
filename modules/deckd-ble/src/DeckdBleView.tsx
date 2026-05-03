import { requireNativeView } from 'expo';
import * as React from 'react';

import { DeckdBleViewProps } from './DeckdBle.types';

const NativeView: React.ComponentType<DeckdBleViewProps> =
  requireNativeView('DeckdBle');

export default function DeckdBleView(props: DeckdBleViewProps) {
  return <NativeView {...props} />;
}
