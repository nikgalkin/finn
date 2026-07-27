import { useEffect, useState } from 'react';
import { readVisualPreferences, subscribeToVisualPreferences } from '../lib/visualPreferences';

export function useVisualPreferences() {
  const [preferences, setPreferences] = useState(readVisualPreferences);

  useEffect(() => subscribeToVisualPreferences(setPreferences), []);

  return preferences;
}
