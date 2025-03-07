import React from 'react';
import { Item, ItemProps } from 'react-contexify';

export function ItemWithDataTestId({
  children,
  dataTestId,
  ...props
}: Omit<ItemProps, 'data-testid'> & { dataTestId?: React.SessionDataTestId }) {
  return (
    <Item data-testid={dataTestId || 'context-menu-item'} {...props}>
      {children}
    </Item>
  );
}
