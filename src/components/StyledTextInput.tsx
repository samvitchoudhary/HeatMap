import React, { useState, forwardRef } from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { theme } from '../lib/theme';

type StyledTextInputProps = TextInputProps & {
  style?: TextInputProps['style'];
  /** When true, no border/background — for inputs inside a custom container (e.g. search bar) */
  embedded?: boolean;
  /** Auth screen style: borderless, 52px height, focus bottom border */
  auth?: boolean;
};

export const StyledTextInput = forwardRef<TextInput, StyledTextInputProps>(
  function StyledTextInput({ style, embedded, auth, onFocus, onBlur, ...props }, ref) {
    const [focused, setFocused] = useState(false);

    const baseStyle = auth
      ? [styles.input, styles.authInput, focused && styles.authInputFocused]
      : embedded
        ? [styles.input, styles.embedded]
        : [styles.input, { borderColor: focused ? theme.colors.textSecondary : theme.colors.border }];

    return (
      <TextInput
        ref={ref}
        style={[...baseStyle, style]}
        placeholderTextColor={theme.colors.textTertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  }
);

const styles = StyleSheet.create({
  input: {
    height: 48,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.colors.text,
  },
  embedded: {
    height: 48,
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  authInput: {
    height: 52,
    borderWidth: 0,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
  },
  authInputFocused: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
});
