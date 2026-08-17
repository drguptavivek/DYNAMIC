/**
 * Provides the authenticated field-app shell, primary drawer, locality scope, and app lock.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";

import { TaskDetailModal } from "../modules/worklist/TaskDetailModal.js";
import { SHELL_NAV_ITEMS } from "../navigation/appNavigation.js";
import { navigateTo } from "../navigation/routes.js";
import { getAssignedLocalities } from "../lib/householdMasterChoices.js";
import { buildClockDriftAlert } from "../modules/sync/syncWorkflow.js";
import * as syncService from "../modules/sync/syncService.js";
import { parseLoginQrPayload } from "../modules/auth/loginQr.js";
import { useFieldApp } from "./FieldAppProvider.js";

export function FieldAppShell({ route, title, children, topBarCollapsed = false }) {
  const app = useFieldApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const clockAlert = buildClockDriftAlert(app.clockStatus);

  async function handleLogout() {
    if (loggingOut) return;
    Alert.alert(
      "Logout and delete device data?",
      "All data stored on this device for the current logged-in user will be deleted. Server data will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              await app.logout();
              setMenuOpen(false);
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  }

  useEffect(() => {
    const isTaskForm = route?.view === "questionnaire" && route?.mode === "new";
    if (!isTaskForm) {
      app.clearFormContext();
    }
  }, [route?.view, route?.mode, route?.formCode]);

  if (!app.user) {
    return <LoginScreen />;
  }

  if (!app.appLockReady) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loginContainer}>
          <ActivityIndicator color="#17202a" />
        </View>
      </SafeAreaView>
    );
  }

  if (app.appLocked) {
    return <AppLockScreen />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.appShell}>
        {menuOpen && (
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => setMenuOpen(false)}
            style={styles.scrim}
          />
        )}

        <View style={[styles.drawer, menuOpen && styles.drawerOpen]}>
          <View style={styles.drawerHeader}>
            <Text style={styles.appTitle}>DYNAMIC</Text>
            <Pressable
              accessibilityLabel="Close menu"
              onPress={() => setMenuOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>x</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.userSection}>
              <Text style={styles.userName}>{app.user.username || app.user.email || "Field Worker"}</Text>
              <Pressable
                onPress={() => {
                  navigateTo("/profile");
                  setMenuOpen(false);
                }}
                style={[styles.profileButton, route?.view === "profile" && styles.profileButtonActive]}
              >
                <Text
                  style={[
                    styles.profileButtonText,
                    route?.view === "profile" && styles.profileButtonTextActive,
                  ]}
                >
                  View Profile
                </Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                disabled={loggingOut}
                style={styles.logoutButton}
              >
                <Text style={styles.logoutButtonText}>{loggingOut ? "Logging out..." : "Logout"}</Text>
              </Pressable>
            </View>

            <LocalitySwitcher inDrawer />

            {SHELL_NAV_ITEMS.map((item) => {
              const active = route?.view === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    navigateTo(item.route);
                    setMenuOpen(false);
                  }}
                  style={[styles.menuItem, active && styles.activeMenuItem]}
                >
                  <Text style={[styles.menuItemText, active && styles.activeMenuItemText]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.main}>
          {!topBarCollapsed ? (
            <View style={styles.topBar}>
              <Pressable
                accessibilityLabel="Open menu"
                onPress={() => setMenuOpen(true)}
                style={styles.menuButton}
              >
                <Text style={styles.menuButtonText}>☰</Text>
              </Pressable>
              <View style={styles.titleGroup}>
                <Text style={styles.appTitle}>DYNAMIC</Text>
                <Text style={styles.subtle}>{title || "Field App"}</Text>
              </View>
            </View>
          ) : null}

          {clockAlert && <ClockDriftAlert alert={clockAlert} />}
          {children}
        </View>
      </View>

      <TaskDetailModal
        visible={app.showTaskModal}
        task={app.selectedTask}
        onClose={app.closeTaskModal}
        onOpenForm={app.openFormFromTask}
        onTaskChanged={app.notifyTaskWorklistChanged}
      />
    </SafeAreaView>
  );
}

function AppLockScreen() {
  const app = useFieldApp();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(app.appLockBiometricAvailable);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setupMode = !app.appLockConfigured;

  async function handleSubmit() {
    if (setupMode && pin !== confirmPin) {
      setError("PIN entries do not match");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = setupMode
        ? await app.configureAppLock(pin, { biometricEnabled: useBiometrics })
        : await app.unlockAppWithPin(pin);
      if (!result.ok) {
        setError(result.error || "Unlock failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordUnlock() {
    if (!password) {
      setError("Enter your login password");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await app.unlockAppWithPassword(password);
      if (!result.ok) {
        setError(result.error || "Password unlock failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricUnlock() {
    setLoading(true);
    setError("");
    try {
      const result = await app.unlockAppWithBiometrics();
      if (!result.ok) {
        setError(result.error || "Biometric unlock failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loginContainer}>
        <View style={styles.loginBox}>
          <Text style={styles.loginTitle}>DYNAMIC</Text>
          <Text style={styles.loginSubtitle}>{setupMode ? "Create App PIN" : "App Locked"}</Text>

          {forgotMode ? (
            <TextInput
              style={styles.loginInput}
              placeholder="Login password"
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              secureTextEntry={true}
              placeholderTextColor="#999"
            />
          ) : (
            <>
              <TextInput
                style={styles.loginInput}
                placeholder="4-8 digit PIN"
                value={pin}
                onChangeText={setPin}
                editable={!loading}
                keyboardType="number-pad"
                secureTextEntry={true}
                maxLength={8}
                placeholderTextColor="#999"
              />

              {setupMode && (
                <TextInput
                  style={styles.loginInput}
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  editable={!loading}
                  keyboardType="number-pad"
                  secureTextEntry={true}
                  maxLength={8}
                  placeholderTextColor="#999"
                />
              )}
            </>
          )}

          {setupMode && !forgotMode && app.appLockBiometricAvailable && (
            <Pressable
              onPress={() => setUseBiometrics((value) => !value)}
              style={[styles.biometricToggle, useBiometrics && styles.biometricToggleActive]}
            >
              <Text
                style={[
                  styles.biometricToggleText,
                  useBiometrics && styles.biometricToggleTextActive,
                ]}
              >
                {useBiometrics ? "Biometric unlock on" : "Biometric unlock off"}
              </Text>
            </Pressable>
          )}

          {error ? <Text style={styles.loginError}>{error}</Text> : null}

          <Pressable
            onPress={forgotMode ? handlePasswordUnlock : handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.loginButton,
              (pressed || loading) && styles.loginButtonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>
                {forgotMode ? "Unlock with Password" : setupMode ? "Set PIN" : "Unlock"}
              </Text>
            )}
          </Pressable>

          {!setupMode && (
            <Pressable
              onPress={() => {
                setForgotMode((value) => !value);
                setError("");
                setPassword("");
              }}
              disabled={loading}
              style={styles.forgotPinButton}
            >
              <Text style={styles.forgotPinText}>
                {forgotMode ? "Use PIN instead" : "Forgot PIN?"}
              </Text>
            </Pressable>
          )}

          {!setupMode && !forgotMode && app.appLockBiometricEnabled && (
            <Pressable
              onPress={handleBiometricUnlock}
              disabled={loading}
              style={({ pressed }) => [
                styles.secondaryLockButton,
                (pressed || loading) && styles.loginButtonPressed,
              ]}
            >
              <Text style={styles.secondaryLockButtonText}>Use biometric unlock</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function LoginScreen() {
  const app = useFieldApp();
  const [username, setUsername] = useState("dev-field-worker");
  const [password, setPassword] = useState("dev-password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  async function submitLogin(nextUsername = username, nextPassword = password) {
    if (!nextUsername || !nextPassword) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await app.login(nextUsername, nextPassword);
      if (!result.ok) {
        setError(result.error || "Login failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    await submitLogin();
  }

  async function handleOpenScanner() {
    setError("");
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setError("Camera permission is required to scan login QR codes");
        return;
      }
    }
    setScannerLocked(false);
    setScannerOpen(true);
  }

  async function handleQrScanned(event) {
    if (scannerLocked) return;
    setScannerLocked(true);
    try {
      const credentials = parseLoginQrPayload(event?.data);
      setScannerOpen(false);
      setLoading(true);
      setError("");
      const result = await app.loginWithQrPayload(credentials.qrPayload);
      if (!result.ok) {
        setError(result.error || "QR login failed");
        setScannerLocked(false);
      }
    } catch (err) {
      setError(err.message || "Could not read login QR code");
      setScannerLocked(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loginContainer}>
        <View style={styles.loginBox}>
          <Text style={styles.loginTitle}>DYNAMIC</Text>
          <Text style={styles.loginSubtitle}>Field Worker Login</Text>

          <TextInput
            style={styles.loginInput}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            editable={!loading}
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.loginInput}
            placeholder="Password"
            secureTextEntry={true}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            placeholderTextColor="#999"
          />

          {error ? <Text style={styles.loginError}>{error}</Text> : null}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              styles.loginButton,
              (pressed || loading) && styles.loginButtonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleOpenScanner}
            disabled={loading}
            style={({ pressed }) => [
              styles.secondaryLockButton,
              (pressed || loading) && styles.loginButtonPressed,
            ]}
          >
            <Text style={styles.secondaryLockButtonText}>Scan QR Login</Text>
          </Pressable>
        </View>
        <Text style={styles.demoText}>Use credentials issued for this study device</Text>
      </View>
      <Modal
        animationType="slide"
        visible={scannerOpen}
        transparent={false}
        onRequestClose={() => setScannerOpen(false)}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan Login QR</Text>
            <Pressable onPress={() => setScannerOpen(false)} style={styles.scannerCloseButton}>
              <Text style={styles.scannerCloseText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.scannerBody}>
            <CameraView
              style={styles.scannerCamera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scannerLocked ? undefined : handleQrScanned}
            />
            <View style={styles.scannerHint}>
              <Text style={styles.scannerHintText}>Place the admin-generated login QR inside the camera frame.</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ClockDriftAlert({ alert }) {
  return (
    <View style={styles.clockAlert}>
      <Text style={styles.clockAlertTitle}>{alert.title}</Text>
      <Text style={styles.clockAlertText}>{alert.message}</Text>
    </View>
  );
}

function LocalitySwitcher({ inDrawer = false }) {
  const app = useFieldApp();
  const localityOptions = useMemo(() => {
    const assignedChoices = getAssignedLocalities(app.user, app.localities, app.user?.site_id);
    const fallbackCodes = assignedChoices.length ? [] : syncService.getAssignedLocalities();
    const choices = assignedChoices.length
      ? assignedChoices
      : fallbackCodes.map((code) => {
          const locality = app.localities.find(
            (item) => String(item.locality_code) === String(code),
          );
          return {
            value: String(code),
            text: {
              default: locality?.locality_name || String(code),
            },
          };
        });

    return choices.map((choice) => ({
        locality_code: String(choice.value),
        locality_name: choice.text?.default || String(choice.value),
      }));
  }, [app.localities, app.user]);

  useEffect(() => {
    if (
      app.selectedLocalityCode &&
      !localityOptions.some(
        (locality) => String(locality.locality_code) === String(app.selectedLocalityCode),
      )
    ) {
      app.setSelectedLocalityCode("");
    }
  }, [app.selectedLocalityCode, app.setSelectedLocalityCode, localityOptions]);

  return (
    <View style={[styles.localitySwitcher, inDrawer && styles.drawerLocalitySwitcher]}>
      <Text style={styles.localityLabel}>Locality</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.localityOptions}
      >
        <Pressable
          onPress={() => app.setSelectedLocalityCode("")}
          style={[styles.localityOption, !app.selectedLocalityCode && styles.localityOptionActive]}
        >
          <Text
            style={[
              styles.localityOptionText,
              !app.selectedLocalityCode && styles.localityOptionTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {localityOptions.map((locality) => {
          const code = String(locality.locality_code);
          const active = String(app.selectedLocalityCode || "") === code;
          return (
            <Pressable
              key={code}
              onPress={() => app.setSelectedLocalityCode(code)}
              style={[styles.localityOption, active && styles.localityOptionActive]}
            >
              <Text
                style={[styles.localityOptionText, active && styles.localityOptionTextActive]}
                numberOfLines={1}
              >
                {locality.locality_name || locality.locality_code}
              </Text>
            </Pressable>
          );
        })}
        {!localityOptions.length ? (
          <Text style={styles.localityEmptyText}>No assigned localities synced</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#eef2f5",
  },
  appShell: {
    flex: 1,
    backgroundColor: "#eef2f5",
  },
  main: {
    flex: 1,
  },
  topBar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
  },
  titleGroup: {
    flex: 1,
    minWidth: 150,
  },
  appTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17202a",
  },
  subtle: {
    fontSize: 13,
    color: "#667085",
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17202a",
  },
  menuButtonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    zIndex: 900,
    elevation: 28,
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: -300,
    width: 300,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#d8dee4",
    zIndex: 1000,
    elevation: 32,
  },
  drawerOpen: {
    left: 0,
  },
  drawerHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2f5",
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17202a",
  },
  userSection: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  userName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#17202a",
  },
  profileButton: {
    minHeight: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2f5",
  },
  profileButtonActive: {
    backgroundColor: "#dbeafe",
  },
  profileButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#344054",
  },
  profileButtonTextActive: {
    color: "#1d4ed8",
  },
  logoutButton: {
    minHeight: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2",
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#991b1b",
  },
  menuItem: {
    minHeight: 42,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  activeMenuItem: {
    backgroundColor: "#e0f2fe",
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#344054",
  },
  activeMenuItemText: {
    color: "#0369a1",
  },
  localitySwitcher: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  drawerLocalitySwitcher: {
    flex: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  localityLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#667085",
    textTransform: "uppercase",
  },
  localityOptions: {
    flexDirection: "row",
    gap: 8,
  },
  localityOption: {
    maxWidth: 160,
    minHeight: 34,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  localityOptionActive: {
    borderColor: "#0369a1",
    backgroundColor: "#e0f2fe",
  },
  localityOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#344054",
  },
  localityOptionTextActive: {
    color: "#0369a1",
  },
  localityEmptyText: {
    alignSelf: "center",
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  clockAlert: {
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d97706",
    backgroundColor: "#fff7ed",
  },
  clockAlertTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#9a3412",
    marginBottom: 4,
  },
  clockAlertText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#9a3412",
  },
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#eef2f5",
  },
  loginBox: {
    width: "100%",
    maxWidth: 420,
    gap: 14,
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#17202a",
  },
  loginSubtitle: {
    fontSize: 16,
    color: "#667085",
    marginBottom: 8,
  },
  loginInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: "#ffffff",
  },
  loginError: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "700",
  },
  loginButton: {
    minHeight: 46,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17202a",
  },
  loginButtonPressed: {
    opacity: 0.8,
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryLockButton: {
    minHeight: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#17202a",
    backgroundColor: "#ffffff",
  },
  secondaryLockButtonText: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "800",
  },
  forgotPinButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  forgotPinText: {
    color: "#0369a1",
    fontSize: 14,
    fontWeight: "800",
  },
  biometricToggle: {
    minHeight: 42,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  biometricToggleActive: {
    borderColor: "#0369a1",
    backgroundColor: "#e0f2fe",
  },
  biometricToggleText: {
    color: "#344054",
    fontSize: 14,
    fontWeight: "800",
  },
  biometricToggleTextActive: {
    color: "#0369a1",
  },
  demoText: {
    marginTop: 14,
    color: "#667085",
    fontSize: 13,
  },
  scannerHeader: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
  },
  scannerTitle: {
    color: "#17202a",
    fontSize: 18,
    fontWeight: "900",
  },
  scannerCloseButton: {
    minHeight: 40,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#eef2f5",
  },
  scannerCloseText: {
    color: "#17202a",
    fontSize: 14,
    fontWeight: "800",
  },
  scannerBody: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  scannerCamera: {
    flex: 1,
  },
  scannerHint: {
    padding: 18,
    backgroundColor: "#ffffff",
  },
  scannerHintText: {
    color: "#344054",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
});
