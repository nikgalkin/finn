import type { ComponentType } from 'react';
import type { LogoChoice } from '../../lib/visualPreferences';
import {
  FinnCandleWordmark,
  FinnFaceWordmark,
  FinnHatLeftWordmark,
  FinnHatWordmark,
  FinnMark,
  FinnPlainWordmark,
} from './LogoConcepts';

export const logoMarks: Record<LogoChoice, ComponentType> = {
  'plain': FinnPlainWordmark,
  'hat-dot': FinnHatWordmark,
  'hat-left': FinnHatLeftWordmark,
  'mark': FinnMark,
  'face': FinnFaceWordmark,
  'candle': FinnCandleWordmark,
};
