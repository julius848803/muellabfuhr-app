import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Zeigt die nächste anstehende Abholung (oder mehrere, falls am selben Tag)
// als kompaktes Homescreen-Widget.
export function NextPickupWidget({ items }) {
  if (!items || items.length === 0) {
    return (
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: '#1a1a28',
          borderRadius: 20,
          padding: 14,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        clickAction="OPEN_APP"
      >
        <TextWidget
          text="🗑️ Keine Termine"
          style={{ fontSize: 14, color: '#999999', fontWeight: 'bold' }}
        />
      </FlexWidget>
    );
  }

  const [first, ...rest] = items;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#1a1a28',
        borderRadius: 20,
        padding: 14,
        justifyContent: 'center',
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text={first.relativeLabel}
        style={{ fontSize: 12, color: '#8ab4f8', fontWeight: 'bold' }}
      />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <FlexWidget
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: first.color,
            marginRight: 8,
          }}
        />
        <TextWidget
          text={first.type}
          style={{ fontSize: 18, color: '#ffffff', fontWeight: 'bold' }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>
      {rest.length > 0 && (
        <TextWidget
          text={`+ ${rest.map((r) => r.type).join(', ')}`}
          style={{ fontSize: 12, color: '#999999', marginTop: 2 }}
          maxLines={1}
          truncate="END"
        />
      )}
    </FlexWidget>
  );
}
