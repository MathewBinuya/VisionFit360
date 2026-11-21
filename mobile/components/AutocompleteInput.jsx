// AutocompleteInput — a lightweight searchable text field (combobox) with a
// suggestion dropdown. No third-party library: just a TextInput plus a small
// list, so it stays small and fully themeable with our existing COLORS. Built
// for the Workout Tracker's Routine / Exercise name fields.
//
// SUGGESTIONS ONLY: the field is a normal text input first. The user can type
// anything; suggestions filter case-insensitively as they type, and a tap just
// fills the field. Non-matching text is kept as a valid custom entry.
//
// The dropdown renders INLINE (in normal layout flow, right under the input)
// rather than as an absolute/elevated overlay. On Android, toggling a view's
// elevation/zIndex on focus re-lays-out the field and drops the keyboard — an
// inline list avoids that entirely, so focus is never lost. It pushes the
// fields below it down only while open.
import { useState, useRef } from 'react';
import { View, TextInput, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import COLORS from '../constants/colors';

const MAX_VISIBLE = 6;

export default function AutocompleteInput({
  value,
  onChangeText,
  suggestions = [],
  placeholder,
  placeholderTextColor = COLORS.placeholderText,
  onFocus,
  onBlur,
  style,
  containerStyle,
  maxVisible = MAX_VISIBLE,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const query = (value || '').trim().toLowerCase();

  // Filter case-insensitively. Empty query → show the (already ordered) list so
  // users who don't know the name can browse. Hide the list once the text is an
  // exact match (nothing left to pick).
  let filtered = suggestions.filter((s) => s.toLowerCase().includes(query));
  const exact = query.length > 0 && filtered.some((s) => s.toLowerCase() === query);
  if (exact && filtered.length <= 1) filtered = [];
  filtered = filtered.slice(0, maxVisible);

  const open = focused && filtered.length > 0;

  const handleFocus = (e) => { setFocused(true); onFocus?.(e); };
  const handleBlur = (e) => { setFocused(false); onBlur?.(e); };

  // Fill the field but KEEP focus (don't blur) so the keyboard stays up for the
  // next field. The value is now an exact match, so the list hides itself.
  const pick = (item) => onChangeText?.(item);

  return (
    <View style={containerStyle}>
      <TextInput
        ref={inputRef}
        style={style}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        autoCorrect={false}
        {...rest}
      />

      {open && (
        <View style={styles.dropdown}>
          {filtered.map((item, i) => (
            <TouchableOpacity
              key={item}
              // keep the keyboard open when a suggestion is tapped
              onPress={() => pick(item)}
              style={[styles.row, i < filtered.length - 1 && styles.rowDivider]}
              accessibilityRole="button"
              accessibilityLabel={`Use ${item}`}
            >
              <Ionicons name="search-outline" size={15} color={COLORS.placeholderText} />
              <Text style={styles.rowText} numberOfLines={1}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = {
  dropdown: {
    marginTop: 4,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.black,
    fontFamily: 'GeneralSans-Variable',
  },
};
