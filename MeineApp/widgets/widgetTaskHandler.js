import React from 'react';
import { NextPickupWidget } from './NextPickupWidget';
import { getNextPickupItems } from '../utils/widgetData';

export async function widgetTaskHandler(props) {
  const items = await getNextPickupItems();

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<NextPickupWidget items={items} />);
      break;
    case 'WIDGET_CLICK':
      // Klick öffnet die App automatisch (clickAction="OPEN_APP" im Widget selbst)
      break;
    default:
      break;
  }
}
