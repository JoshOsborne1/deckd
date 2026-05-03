import * as React from 'react';

import { DeckdBleViewProps } from './DeckdBle.types';

export default function DeckdBleView(props: DeckdBleViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad?.({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
