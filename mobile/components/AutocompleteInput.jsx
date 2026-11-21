// AutocompleteInput — a lightweight searchable text field (combobox) with a
// floating suggestion dropdown. No third-party library: just a TextInput plus an
// absolutely-positioned list, so it stays small and fully themeable with our
// existing COLORS. Built for the Workout Tracker's Routine / Exercise name
// fields.
//
// SUGGESTIONS ONLY: the field is a normal text input first. The user can type
// anything; suggestions filter case-insensitively as they type, and a tap just
// fills the field. Non-matching text is kept as a valid custom entry.
//
// The dropdown floats over the content below it (zIndex/elevation raised only
// while open), so it never permanently pushes the form around.
import { useState, useRef } from 'react';
import { View, TextInput, Text, TouchableOpacity, ScrollView } from 'react-native';
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

  const pick = (item) => {
    onChangeText?.(item);
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    // Raise stacking only while open so the dropdown overlays the fields beneath
    // it; collapse it again afterwards so neighbouring dropdowns stack correctly.
    <View style={[{ position: 'relative' }, open && { zIndex: 20, elevation: 20 }, containerStyle]}>
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((item, i) => (
              <TouchableOpacity
                key={item}
                onPress={() => pick(item)}
                style={[styles.row, i < filtered.length - 1 && styles.rowDivider]}
                accessibilityRole="button"
                accessibilityLabel={`Use ${item}`}
              >
                <Ionicons name="search-outline" size={15} color={COLORS.placeholderText} />
                <Text style={styles.rowText} numberOfLines={1}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = {
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 210,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    // float above the form (both platforms)
    zIndex: 30,
    elevation: 6,
    shadowColor: COLORS.black,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
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
