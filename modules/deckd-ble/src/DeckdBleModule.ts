import { requireNativeModule } from 'expo-modules-core';

import type { DeckdBleNativeModule } from './DeckdBle.types';

export default requireNativeModule<DeckdBleNativeModule>('DeckdBle');
