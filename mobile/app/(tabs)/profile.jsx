import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, RefreshControl } from 'react-native'
import { useState, useEffect, useRef, useCallback } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from "@expo/vector-icons"
import * as ImagePicker from "expo-image-picker"
import AsyncStorage from '@react-native-async-storage/async-storage'
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/tabStyle/account.style'
import api from '../../lib/axios'
import { useAuthStore } from '../../store/authStore'
import { useAlert } from '../../components/AppAlert'
import {
  cmToFtIn, ftInToCm, kgToLb, lbToKg, cleanNumber, unitPrefKey,
  MIN_HEIGHT_CM, MAX_HEIGHT_CM, MIN_WEIGHT_KG, MAX_WEIGHT_KG,
} from '../../lib/units'
import DateField from '../../components/DateField'
import { ageFromDob, isValidDob, formatDob, maxBirthDate, minBirthDate, MIN_AGE, MAX_AGE } from '../../lib/age'

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const alert = useAlert();

  const [form, setForm] = useState({ username: "", bio: "", firstName: "", lastName: "", middleName: "" });
  // which real-name fields are already set on the server (locked / read-only)
  const [nameLocked, setNameLocked] = useState({ firstName: false, lastName: false, middleName: false });
  const [photo, setPhoto] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false); // read-only until "Edit Profile" is tapped
  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = editing; }, [editing]);
  const origUsernameRef = useRef(""); // the username as loaded, to detect real changes

  // canonical metric values (what we send)
  const [metricHeight, setMetricHeight] = useState("");
  const [metricWeight, setMetricWeight] = useState("");
  // Date of birth is set once. `dobLocked` = the server already has one, so it's
  // read-only; older accounts with none can set it a single time while editing.
  const [dob, setDob] = useState(null);
  const [dobLocked, setDobLocked] = useState(false);

  // display units + per-unit input fields
  const [heightUnit, setHeightUnit] = useState("cm");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [ftVal, setFtVal] = useState("");
  const [inVal, setInVal] = useState("");
  const [lbVal, setLbVal] = useState("");

  useEffect(() => {
    init();
  }, []);

  // Leaving the Profile tab (bottom nav) exits edit mode and discards any unsaved
  // edits, so coming back shows the read-only view and the user must tap "Edit
  // Profile" again. The tab screen stays mounted on switch, so we reset on blur.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (editingRef.current) {
          setEditing(false);
          loadProfile();   // restore saved values (drop unsaved height/weight edits)
        }
      };
    }, [])
  );

  const init = async () => {
    let hUnit = "cm", wUnit = "kg";
    try {
      const raw = await AsyncStorage.getItem(unitPrefKey(user?.id));
      if (raw) {
        const p = JSON.parse(raw);
        if (p.height === "ft" || p.height === "cm") hUnit = p.height;
        if (p.weight === "lb" || p.weight === "kg") wUnit = p.weight;
      }
    } catch (_e) {}
    setHeightUnit(hUnit);
    setWeightUnit(wUnit);
    await loadProfile(hUnit, wUnit);
  };

  const loadProfile = async (hUnit = heightUnit, wUnit = weightUnit) => {
    try {
      const res = await api.get("/profile");
      const h = res.data.heightCm?.toString() || "";
      const w = res.data.weightKg?.toString() || "";
      setForm({
        username: res.data.username || "",
        bio: res.data.bio || "",
        firstName: res.data.firstName || "",
        lastName: res.data.lastName || "",
        middleName: res.data.middleName || "",
      });
      setNameLocked({
        firstName: !!res.data.firstName,
        lastName: !!res.data.lastName,
        middleName: !!res.data.middleName,
      });
      origUsernameRef.current = res.data.username || "";
      setMetricHeight(h);
      setMetricWeight(w);
      setDob(res.data.dateOfBirth ? new Date(res.data.dateOfBirth) : null);
      setDobLocked(!!res.data.dateOfBirth);
      if (hUnit === "ft") { const { ft, in: inch } = cmToFtIn(h); setFtVal(ft); setInVal(inch); }
      if (wUnit === "lb") setLbVal(kgToLb(w));
      setPhoto(res.data.photo || "");
      await setUser({ ...user, ...res.data });
    } catch (error) {
      alert("Error", error.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const savePref = async (height, weight) => {
    try {
      await AsyncStorage.setItem(unitPrefKey(user?.id), JSON.stringify({ height, weight }));
    } catch (_e) {}
  };

  // --- unit handlers ---
  const onHeightCm = (t) => setMetricHeight(cleanNumber(t));
  const onFt = (t) => { const v = cleanNumber(t); setFtVal(v); setMetricHeight(ftInToCm(v, inVal)); };
  const onIn = (t) => { const v = cleanNumber(t); setInVal(v); setMetricHeight(ftInToCm(ftVal, v)); };
  const toggleHeightUnit = (u) => {
    if (u === heightUnit) return;
    if (u === "ft") { const { ft, in: inch } = cmToFtIn(metricHeight); setFtVal(ft); setInVal(inch); }
    setHeightUnit(u);
    savePref(u, weightUnit);
  };
  const onWeightKg = (t) => setMetricWeight(cleanNumber(t, true));
  const onLb = (t) => { const v = cleanNumber(t, true); setLbVal(v); setMetricWeight(lbToKg(v)); };
  const toggleWeightUnit = (u) => {
    if (u === weightUnit) return;
    if (u === "lb") setLbVal(kgToLb(metricWeight));
    setWeightUnit(u);
    savePref(heightUnit, u);
  };

  const saveProfile = async () => {
    const uname = form.username.trim();
    // only validate/send the username when it actually changed, so an older
    // account with a legacy-format handle isn't blocked from saving other fields
    const usernameChanged = uname !== (origUsernameRef.current || "");
    if (usernameChanged && !/^[a-zA-Z0-9_]{3,30}$/.test(uname)) {
      alert("Invalid username", "Username must be 3–30 characters: letters, numbers or underscores.");
      return;
    }
    // first + last name are required together: enter both or neither (middle is
    // optional). Lets older accounts still save other fields without a name.
    const fName = form.firstName.trim(), lName = form.lastName.trim();
    if ((fName && !lName) || (!fName && lName)) {
      alert("Name needed", "Please enter both your first and last name.");
      return;
    }
    if (metricHeight) {
      const h = Number(metricHeight);
      if (isNaN(h) || h < MIN_HEIGHT_CM || h > MAX_HEIGHT_CM) {
        alert("Invalid height", `Please enter a valid height (${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm).`);
        return;
      }
    }
    if (metricWeight) {
      const w = Number(metricWeight);
      if (isNaN(w) || w < MIN_WEIGHT_KG || w > MAX_WEIGHT_KG) {
        alert("Invalid weight", `Please enter a valid weight (${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg).`);
        return;
      }
    }
    // date of birth: only sent when setting it for the first time (not locked)
    const settingDob = !dobLocked && dob != null;
    if (settingDob && !isValidDob(dob)) {
      alert("Invalid date of birth", `Please enter a valid date of birth (age ${MIN_AGE}–${MAX_AGE}).`);
      return;
    }
    setSaving(true);
    try {
      // gender/goal omitted (set at onboarding). Username is editable + unique.
      // dateOfBirth and the real-name fields are set-once: a field is only sent
      // while still unset; the backend enforces the lock too.
      await api.put("/profile", {
        username: usernameChanged ? uname : undefined,
        bio: form.bio,
        firstName: !nameLocked.firstName ? form.firstName.trim() : undefined,
        lastName: !nameLocked.lastName ? form.lastName.trim() : undefined,
        middleName: !nameLocked.middleName ? form.middleName.trim() : undefined,
        dateOfBirth: settingDob ? dob.toISOString() : undefined,
        heightCm: metricHeight ? Number(metricHeight) : undefined,
        weightKg: metricWeight ? Number(metricWeight) : undefined,
      });

      await loadProfile();
      setEditing(false);
      alert("Saved", "Profile updated");
    } catch (error) {
      alert("Error", error.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // confirm before entering edit mode (so a stray tap doesn't open the editor)
  const confirmEdit = () => {
    alert(
      "Edit profile",
      "Do you want to edit your profile?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Edit", onPress: () => setEditing(true) },
      ],
      { cancelable: true }
    );
  };

  // leave edit mode without saving — revert any unsaved height/weight edits
  const cancelEdit = async () => {
    setEditing(false);
    await loadProfile();
  };

  // derived age (never stored) — shown read-only beside the birthdate
  const age = ageFromDob(dob);

  // read-only display strings (shown in view mode and for the locked fields)
  const heightDisplay = heightUnit === "ft"
    ? (ftVal || inVal ? `${ftVal || 0} ft ${inVal || 0} in` : "—")
    : (metricHeight ? `${metricHeight} cm` : "—");
  const weightDisplay = weightUnit === "lb"
    ? (lbVal ? `${lbVal} lb` : "—")
    : (metricWeight ? `${metricWeight} kg` : "—");

  const pickAndUploadPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alert("Permission needed", "Allow photo access to change your picture");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    const image = result.assets[0];
    const formData = new FormData();
    formData.append("photo", { uri: image.uri, type: "image/jpeg", name: "photo.jpg" });

    try {
      const res = await api.post("/profile/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPhoto(res.data.photo);
      await setUser({ ...user, photo: res.data.photo });
    } catch (error) {
      alert("Error", error.response?.data?.message || "Upload failed");
    }
  };

  // asks for confirmation before logging out
  const handleLogout = () => {
    alert(
      "Log out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(auth)");
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Real-name field: editable (settable) only while editing AND not yet locked;
  // otherwise read-only, dimmed when locked.
  const NameRow = (label, key, optional = false) => {
    const locked = nameLocked[key];
    const canEdit = editing && !locked;
    return (
      <View key={key}>
        <Text style={styles.label}>{label}{optional ? " (optional)" : ""}</Text>
        {canEdit ? (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={label}
              placeholderTextColor={COLORS.placeholderText}
              value={form[key]}
              onChangeText={(t) => setForm((f) => ({ ...f, [key]: t }))}
              maxLength={40}
              autoCapitalize="words"
            />
          </View>
        ) : (
          <View style={locked ? { opacity: 0.55 } : null}>
            <View style={styles.readOnlyBox}>
              <Text style={styles.readValue}>{form[key] || "—"}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const UnitToggle = ({ units, active, onPick }) => (
    <View style={styles.unitToggle}>
      {units.map((u) => (
        <TouchableOpacity
          key={u}
          style={[styles.unitPill, active === u && styles.unitPillActive]}
          onPress={() => onPick(u)}
        >
          <Text style={[styles.unitText, active === u && styles.unitTextActive]}>
            {u === "ft" ? "ft/in" : u}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.button} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.button} colors={[COLORS.button]} />
      }
    >
      {/* Photo */}
      <View style={styles.avatarWrap}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitials}>
              {user?.username?.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
        )}
        {/* photo is only changeable while editing */}
        {editing && (
          <TouchableOpacity onPress={pickAndUploadPhoto} style={styles.changePhotoBtn}>
            <Ionicons name="camera-outline" size={16} color={COLORS.button} />
            <Text style={styles.changePhotoText}>Change photo</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.usernameText}>@{user?.username}</Text>
      </View>

      {/* Username — the @handle + "Hello, X" identity (editable, unique) */}
      <Text style={styles.label}>Username</Text>
      {!editing ? (
        <View style={styles.readOnlyBox}>
          <Text style={styles.readValue}>{form.username || "—"}</Text>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="username"
            placeholderTextColor={COLORS.placeholderText}
            value={form.username}
            onChangeText={(t) => setForm((f) => ({ ...f, username: t.replace(/[^a-zA-Z0-9_]/g, "") }))}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {/* Real name — optional, set once then locked */}
      {NameRow("First name", "firstName")}
      {NameRow("Last name", "lastName")}
      {NameRow("Middle name", "middleName", true)}
      {editing && (!nameLocked.firstName || !nameLocked.lastName || !nameLocked.middleName) && (
        <Text style={{ fontSize: 12, color: COLORS.placeholderText, marginTop: 6 }}>
          Your name can be set once. After you save, it can&apos;t be changed.
        </Text>
      )}

      {/* Bio */}
      <Text style={styles.label}>Bio</Text>
      {!editing ? (
        <View style={styles.readOnlyBox}>
          <Text style={styles.readValue}>{form.bio || "—"}</Text>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.bioInput}
            placeholder="Tell us a bit about yourself"
            placeholderTextColor={COLORS.placeholderText}
            value={form.bio}
            onChangeText={(t) => setForm((f) => ({ ...f, bio: t }))}
            maxLength={160}
            multiline
          />
        </View>
      )}

      {/* Birthdate + Age — read-only once set, stacked (birthdate first, age under
          it) for a cleaner, more professional read. Accounts without a DOB (older
          users) can set it once while editing; after saving it stays fixed. */}
      <Text style={styles.label}>Birthdate</Text>
      {/* dimmed slightly to read as non-editable info */}
      <View style={{ opacity: 0.55 }}>
        <View style={styles.readOnlyBox}>
          <Text style={styles.readValue}>{dob ? formatDob(dob) : "—"}</Text>
        </View>
      </View>

      <Text style={styles.label}>Age</Text>
      <View style={{ opacity: 0.55 }}>
        <View style={styles.readOnlyBox}>
          <Text style={styles.readValue}>{age != null ? `${age} years old` : "—"}</Text>
        </View>
      </View>
      {editing && !dobLocked && (
        <View style={{ marginTop: 10 }}>
          <DateField
            value={dob}
            onChange={setDob}
            placeholder="Select your date of birth"
            maximumDate={maxBirthDate()}
            minimumDate={minBirthDate()}
          />
          <Text style={{ fontSize: 12, color: COLORS.placeholderText, marginTop: 6 }}>
            You can set this once. After you save, it can&apos;t be changed.
          </Text>
        </View>
      )}

      {/* Height */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Height</Text>
        {editing && <UnitToggle units={["cm", "ft"]} active={heightUnit} onPick={toggleHeightUnit} />}
      </View>
      {!editing ? (
        <View style={styles.readOnlyBox}>
          <Text style={styles.readValue}>{heightDisplay}</Text>
        </View>
      ) : heightUnit === "cm" ? (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="175"
            placeholderTextColor={COLORS.placeholderText}
            value={metricHeight}
            onChangeText={onHeightCm}
            keyboardType="numeric"
            maxLength={3}
          />
          <Text style={styles.unitSuffix}>cm</Text>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={[styles.inputRow, { flex: 1 }]}>
            <TextInput
              style={styles.input}
              placeholder="5"
              placeholderTextColor={COLORS.placeholderText}
              value={ftVal}
              onChangeText={onFt}
              keyboardType="numeric"
              maxLength={1}
            />
            <Text style={styles.unitSuffix}>ft</Text>
          </View>
          <View style={[styles.inputRow, { flex: 1 }]}>
            <TextInput
              style={styles.input}
              placeholder="9"
              placeholderTextColor={COLORS.placeholderText}
              value={inVal}
              onChangeText={onIn}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text style={styles.unitSuffix}>in</Text>
          </View>
        </View>
      )}

      {/* Weight */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Weight</Text>
        {editing && <UnitToggle units={["kg", "lb"]} active={weightUnit} onPick={toggleWeightUnit} />}
      </View>
      {!editing ? (
        <View style={styles.readOnlyBox}>
          <Text style={styles.readValue}>{weightDisplay}</Text>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={weightUnit === "kg" ? "70" : "154"}
            placeholderTextColor={COLORS.placeholderText}
            value={weightUnit === "kg" ? metricWeight : lbVal}
            onChangeText={weightUnit === "kg" ? onWeightKg : onLb}
            keyboardType="numeric"
            maxLength={6}
          />
          <Text style={styles.unitSuffix}>{weightUnit}</Text>
        </View>
      )}

      {editing ? (
        <>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={saveProfile}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? "Saving..." : "Save changes"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={[styles.saveBtn, { flexDirection: "row" }]} onPress={confirmEdit}>
          <Ionicons name="create-outline" size={18} color={COLORS.white} />
          <Text style={[styles.saveText, { marginLeft: 6 }]}>Edit Profile</Text>
        </TouchableOpacity>
      )}

      {/* Feedback — opens the feedback screen (owned by the feedback feature) */}
      <TouchableOpacity style={styles.rowBtn} onPress={() => router.push('/feedback')}>
        <Ionicons name="chatbox-ellipses-outline" size={18} color={COLORS.button} />
        <Text style={styles.rowBtnText}>Send feedback</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.placeholderText} style={{ marginLeft: "auto" }} />
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#a32d2d" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
