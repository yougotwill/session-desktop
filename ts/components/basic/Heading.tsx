import { ReactNode } from 'react';
import styled, { CSSProperties } from 'styled-components';

export type HeadingProps = {
  children: string | ReactNode;
  color?: string;
  style?: CSSProperties;
  /** center | start (left) | end (right) */
  alignText?: 'center' | 'start' | 'end';
  fontWeight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

type StyledHeadingProps = HeadingProps & {
  size: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8' | 'h9';
};

const headingStyles = (props: StyledHeadingProps) => `
padding: 0;
margin: 0;
font-weight: ${props.fontWeight ? props.fontWeight : '700'};
${props.color ? `color: ${props.color};` : ''}
${props.size ? `font-size: var(--font-size-${props.size});` : ''}
${props.alignText ? `text-align: ${props.alignText};` : ''}
`;
const Heading = (headerProps: StyledHeadingProps) => {
  const StyledHeading =
    headerProps.size === 'h7' || headerProps.size === 'h8' || headerProps.size === 'h9'
      ? styled.h6<StyledHeadingProps>`
          ${props => headingStyles(props)}
        `
      : styled(headerProps.size)<StyledHeadingProps>`
          ${props => headingStyles(props)}
        `;

  return <StyledHeading {...headerProps}>{headerProps.children}</StyledHeading>;
};

/** --font-size-h1 36px */
export const H1 = (props: HeadingProps) => {
  return <Heading {...props} size="h1" />;
};

/** --font-size-h2 32px */
export const H2 = (props: HeadingProps) => {
  return <Heading {...props} size="h2" />;
};

/** --font-size-h3 29px */
export const H3 = (props: HeadingProps) => {
  return <Heading {...props} size="h3" />;
};

/** --font-size-h4 26px */
export const H4 = (props: HeadingProps) => {
  return <Heading {...props} size="h4" />;
};

/** --font-size-h5 23px */
export const H5 = (props: HeadingProps) => {
  return <Heading {...props} size="h5" />;
};

/** --font-size-h6 20px */
export const H6 = (props: HeadingProps) => {
  return <Heading {...props} size="h6" />;
};

/** --font-size-h7 18px */
export const H7 = (props: HeadingProps) => {
  return <Heading {...props} size="h7" />;
};

/** --font-size-h8 16px */
export const H8 = (props: HeadingProps) => {
  return <Heading {...props} size="h8" />;
};

/** --font-size-h9 14px */
export const H9 = (props: HeadingProps) => {
  return <Heading {...props} size="h9" />;
};
