import { ReactNode } from 'react';
import styled, { CSSProperties } from 'styled-components';

type HeadingProps = {
  children: string | ReactNode;
  style?: CSSProperties;
};

type StyledHeadingProps = HeadingProps & {
  size: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8' | 'h9';
};

const headingStyles = (props: StyledHeadingProps) => `
  ${props.size && `font-size: var(--font-size-${props.size});`}
  font-weight: 700;
  margin: 0;
  padding: 0;
  `;

const Heading = (headerProps: StyledHeadingProps) => {
  const StyledHeading =
    headerProps.size === 'h7' || headerProps.size === 'h8' || headerProps.size === 'h9'
      ? styled.h6<StyledHeadingProps>`
          ${headingStyles(headerProps)}
        `
      : styled(headerProps.size)<StyledHeadingProps>`
          ${headingStyles(headerProps)}
        `;

  return <StyledHeading {...headerProps}>{headerProps.children}</StyledHeading>;
};

/** --font-size-h1 36px */
export const H1 = (props: HeadingProps) => {
  return <Heading size="h1" {...props} />;
};

/** --font-size-h2 32px */
export const H2 = (props: HeadingProps) => {
  return <Heading size="h2" {...props} />;
};

/** --font-size-h3 29px */
export const H3 = (props: HeadingProps) => {
  return <Heading size="h3" {...props} />;
};

/** --font-size-h4 26px */
export const H4 = (props: HeadingProps) => {
  return <Heading size="h4" {...props} />;
};

/** --font-size-h5 23px */
export const H5 = (props: HeadingProps) => {
  return <Heading size="h5" {...props} />;
};

/** --font-size-h6 20px */
export const H6 = (props: HeadingProps) => {
  return <Heading size="h6" {...props} />;
};

/** --font-size-h7 18px */
export const H7 = (props: HeadingProps) => {
  return <Heading size="h7" {...props} />;
};

/** --font-size-h8 16px */
export const H8 = (props: HeadingProps) => {
  return <Heading size="h8" {...props} />;
};

/** --font-size-h9 14px */
export const H9 = (props: HeadingProps) => {
  return <Heading size="h9" {...props} />;
};
