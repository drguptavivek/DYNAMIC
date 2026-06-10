import "survey-core/survey-core.min.css";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { surveyLocalization } from "survey-core";

import { formCatalog } from "./data/formCatalog";
import { HouseholdModule } from "./modules/households/HouseholdModule";
import { HouseholdMembersModule } from "./modules/households/HouseholdMembersModule";
import { initializeHouseholdRepository, listLocalities } from "./modules/households/householdRepository.js";
import { QuestionnaireDashboard } from "./modules/questionnaires/QuestionnaireDashboard";
import { ROUTES, navigateTo, parseHashRoute } from "./navigation/routes";
import { initTaskDb } from "./modules/tasks/taskSchema.js";
import { WorklistScreen } from "./modules/worklist/WorklistScreen.js";
import { TaskDetailModal } from "./modules/worklist/TaskDetailModal.js";
import { SyncScreen } from "./modules/sync/SyncScreen.js";
import { FieldWorkerProfileScreen } from "./modules/profile/FieldWorkerProfileScreen.js";
import * as authStore from "./modules/auth/authStore.js";
import * as syncService from "./modules/sync/syncService.js";
import { buildClockDriftAlert } from "./modules/sync/syncWorkflow.js";
import { getHouseholdContextSync } from "./lib/householdSync.js";
import { buildPrefillForTask } from "./lib/prefillMapper.js";

surveyLocalization.supportedLocales = ["default", "hi"];

const HOUSEHOLDS_VIEW = "households";
const HOUSEHOLD_MEMBERS_VIEW = "householdMembers";
const QUESTIONNAIRE_VIEW = "questionnaire";
const WORKLIST_VIEW = "worklist";
const SYNC_VIEW = "sync";
const PROFILE_VIEW = "profile";
const LOGIN_VIEW = "login";
const DEFAULT_FORM_CODE = formCatalog[0]?.form_code;

function getCurrentRoute() {
  if (typeof window === "undefined") {
    return { view: "home", formCode: DEFAULT_FORM_CODE, mode: "dashboard" };
  }
  return parseHashRoute(window.location.hash, DEFAULT_FORM_CODE);
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("dev-field-worker");
  const [password, setPassword] = useState("dev-password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await authStore.login(username, password);
      if (result.ok) {
        onLogin(result.user);
      } else {
        setError(result.error || "Login failed");
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

          {error && <Text style={styles.loginError}>{error}</Text>}

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
        </View>
        <Text style={styles.demoText}>Use credentials issued for this study device</Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [route, setRoute] = useState(getCurrentRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const [locale, setLocale] = useState("default");
  const [user, setUser] = useState(null);
  const [taskDbReady, setTaskDbReady] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [currentTaskContext, setCurrentTaskContext] = useState(null);
  const [prefillData, setPrefillData] = useState(null);
  const [readOnlyFields, setReadOnlyFields] = useState(null);
  const [selectedLocalityCode, setSelectedLocalityCode] = useState("");
  const [localities, setLocalities] = useState([]);
  const [clockStatus, setClockStatus] = useState(null);

  useEffect(() => {
    async function initApp() {
      try {
        initTaskDb();
        setTaskDbReady(true);

        const restoreUser = await authStore.restoreSession();
        if (restoreUser) {
          setUser(restoreUser);
        }

        await refreshLocalities();
        setClockStatus(syncService.getClockStatus());
      } catch (error) {
        console.error("App init error:", error);
      }
    }

    initApp();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !taskDbReady) return undefined;
    const onHashChange = () => {
      setRoute(getCurrentRoute());
      setMenuOpen(false);
      // Clear task context when navigating away from a form
      setCurrentTaskContext(null);
      setPrefillData(null);
      setReadOnlyFields(null);
      setClockStatus(syncService.getClockStatus());
    };
    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [taskDbReady]);

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  async function refreshLocalities() {
    await initializeHouseholdRepository();
    setLocalities(await listLocalities());
  }

  function handleOpenTask(task) {
    setSelectedTask(task);
    setShowTaskModal(true);
  }

  function handleOpenFormFromTask(task) {
    // Fetch household and member data if available
    if (task.household_id) {
      try {
        const context = getHouseholdContextSync(task.household_id, task.subject_id);
        const { prefill, readOnlyFields: roFields } = buildPrefillForTask(
          task,
          context.household,
          context.member,
        );

        setCurrentTaskContext(task);
        setPrefillData(prefill);
        setReadOnlyFields(roFields);
      } catch (error) {
        console.error("Error fetching task context:", error);
        setCurrentTaskContext(task);
        setPrefillData(null);
        setReadOnlyFields(null);
      }
    } else {
      setCurrentTaskContext(task);
      setPrefillData(null);
      setReadOnlyFields(null);
    }

    navigateTo(ROUTES.questionnaire(task.task_type));
  }

  const clockAlert = buildClockDriftAlert(clockStatus);

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

          <View style={styles.userSection}>
            <Text style={styles.userName}>{user.username || user.email || "Field Worker"}</Text>
            <Pressable
              onPress={() => navigateTo(ROUTES.profile)}
              style={[
                styles.profileButton,
                route.view === PROFILE_VIEW && styles.profileButtonActive
              ]}
            >
              <Text
                style={[
                  styles.profileButtonText,
                  route.view === PROFILE_VIEW && styles.profileButtonTextActive
                ]}
              >
                View Profile
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                authStore.logout();
                setUser(null);
                setMenuOpen(false);
              }}
              style={styles.logoutButton}
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => navigateTo(ROUTES.profile)}
            style={[styles.menuItem, route.view === PROFILE_VIEW && styles.activeMenuItem]}
          >
            <Text
              style={[
                styles.menuItemText,
                route.view === PROFILE_VIEW && styles.activeMenuItemText,
              ]}
            >
              👤 Profile
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigateTo(ROUTES.worklist)}
            style={[styles.menuItem, route.view === WORKLIST_VIEW && styles.activeMenuItem]}
          >
            <Text
              style={[
                styles.menuItemText,
                route.view === WORKLIST_VIEW && styles.activeMenuItemText,
              ]}
            >
              📋 Worklist
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigateTo(ROUTES.sync)}
            style={[styles.menuItem, route.view === SYNC_VIEW && styles.activeMenuItem]}
          >
            <Text
              style={[styles.menuItemText, route.view === SYNC_VIEW && styles.activeMenuItemText]}
            >
              🔄 Sync
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigateTo(ROUTES.households)}
            style={[styles.menuItem, route.view === HOUSEHOLDS_VIEW && styles.activeMenuItem]}
          >
            <Text
              style={[
                styles.menuItemText,
                route.view === HOUSEHOLDS_VIEW && styles.activeMenuItemText,
              ]}
            >
              🏠 Households
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigateTo(ROUTES.householdMembers)}
            style={[
              styles.menuItem,
              route.view === HOUSEHOLD_MEMBERS_VIEW && styles.activeMenuItem,
            ]}
          >
            <Text
              style={[
                styles.menuItemText,
                route.view === HOUSEHOLD_MEMBERS_VIEW && styles.activeMenuItemText,
              ]}
            >
              👥 Household Members
            </Text>
          </Pressable>

          <View style={styles.menuSection}>
            <Text style={styles.menuSectionLabel}>Questionnaires</Text>
            {formCatalog.map((form) => {
              const active = route.view === QUESTIONNAIRE_VIEW && route.formCode === form.form_code;
              return (
                <Pressable
                  key={form.form_code}
                  onPress={() => navigateTo(ROUTES.questionnaire(form.form_code))}
                  style={[styles.menuItem, active && styles.activeMenuItem]}
                >
                  <Text style={[styles.menuItemText, active && styles.activeMenuItemText]}>
                    {`${form.form_code} · ${form.title}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Open menu"
              onPress={() => setMenuOpen(true)}
              style={styles.menuButton}
            >
              <Text style={styles.menuButtonText}>☰</Text>
            </Pressable>
            <View>
              <Text style={styles.appTitle}>DYNAMIC</Text>
              <Text style={styles.subtle}>
                {route.view === WORKLIST_VIEW
                  ? "Worklist"
                  : route.view === PROFILE_VIEW
                    ? "Profile"
                  : route.view === SYNC_VIEW
                    ? "Sync Status"
                    : route.view === HOUSEHOLDS_VIEW
                      ? "Households"
                      : route.view === HOUSEHOLD_MEMBERS_VIEW
                        ? "Household Members"
                        : route.view === QUESTIONNAIRE_VIEW
                          ? `${route.formCode}`
                          : "Home"}
              </Text>
            </View>
            <LocalitySwitcher
              localities={localities}
              selectedLocalityCode={selectedLocalityCode}
              onChange={setSelectedLocalityCode}
            />
          </View>

          {clockAlert && <ClockDriftAlert alert={clockAlert} />}

          {route.view === "home" ? (
            <View style={styles.homeCanvas} />
          ) : route.view === PROFILE_VIEW ? (
            <FieldWorkerProfileScreen user={user} localities={localities} />
          ) : route.view === WORKLIST_VIEW ? (
            <WorklistScreen
              onOpenTask={handleOpenTask}
              selectedLocalityCode={selectedLocalityCode}
            />
          ) : route.view === SYNC_VIEW ? (
            <SyncScreen onClockStatusChange={setClockStatus} />
          ) : route.view === HOUSEHOLDS_VIEW ? (
            <HouseholdModule
              locale={locale}
              mode={route.mode}
              onLocaleChange={setLocale}
              user={user}
              localities={localities}
              selectedLocalityCode={selectedLocalityCode}
              onDataSynced={refreshLocalities}
            />
          ) : route.view === HOUSEHOLD_MEMBERS_VIEW ? (
            <HouseholdMembersModule
              householdId={route.householdId}
              selectedLocalityCode={selectedLocalityCode}
            />
          ) : (
            <QuestionnaireDashboard
              formCode={route.formCode}
              locale={locale}
              mode={route.mode}
              onLocaleChange={setLocale}
              taskContext={currentTaskContext}
              prefillData={prefillData}
              readOnlyFields={readOnlyFields}
              user={user}
            />
          )}
        </View>
      </View>

      <TaskDetailModal
        visible={showTaskModal}
        task={selectedTask}
        onClose={() => setShowTaskModal(false)}
        onOpenForm={handleOpenFormFromTask}
      />
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

function LocalitySwitcher({ localities, selectedLocalityCode, onChange }) {
  return (
    <View style={styles.localitySwitcher}>
      <Text style={styles.localityLabel}>Locality</Text>
      <ScrollLocalities
        localities={localities}
        selectedLocalityCode={selectedLocalityCode}
        onChange={onChange}
      />
    </View>
  );
}

function ScrollLocalities({ localities, selectedLocalityCode, onChange }) {
  return (
    <View style={styles.localityOptions}>
      <Pressable
        onPress={() => onChange("")}
        style={[
          styles.localityOption,
          !selectedLocalityCode && styles.localityOptionActive
        ]}
      >
        <Text
          style={[
            styles.localityOptionText,
            !selectedLocalityCode && styles.localityOptionTextActive
          ]}
        >
          All
        </Text>
      </Pressable>
      {localities.map((locality) => {
        const active = selectedLocalityCode === locality.locality_code;
        return (
          <Pressable
            key={locality.locality_code}
            onPress={() => onChange(locality.locality_code)}
            style={[styles.localityOption, active && styles.localityOptionActive]}
          >
            <Text
              style={[
                styles.localityOptionText,
                active && styles.localityOptionTextActive
              ]}
              numberOfLines={1}
            >
              {locality.locality_name || locality.locality_code}
            </Text>
          </Pressable>
        );
      })}
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
    minHeight: "100vh",
    backgroundColor: "#eef2f5",
  },
  main: {
    flex: 1,
    minHeight: "100vh",
  },
  topBar: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
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
    fontWeight: "600",
    color: "#9a3412",
  },
  localitySwitcher: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  localityLabel: {
    fontSize: 12,
    color: "#667085",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  localityOptions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 6,
    maxWidth: 620,
  },
  localityOption: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  localityOptionActive: {
    borderColor: "#1f6feb",
    backgroundColor: "#eef6ff",
  },
  localityOptionText: {
    maxWidth: 150,
    fontSize: 13,
    color: "#475467",
    fontWeight: "800",
  },
  localityOptionTextActive: {
    color: "#1f6feb",
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d8dee4",
    backgroundColor: "#ffffff",
  },
  menuButtonText: {
    fontSize: 24,
    lineHeight: 26,
    color: "#18202a",
    fontWeight: "700",
  },
  scrim: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    zIndex: 10,
  },
  drawer: {
    position: "fixed",
    top: 0,
    bottom: 0,
    left: -300,
    width: 300,
    padding: 18,
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightColor: "#d8dee4",
    zIndex: 11,
    gap: 14,
    overflow: "auto",
  },
  drawerOpen: {
    left: 0,
  },
  drawerHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  closeButtonText: {
    fontSize: 24,
    color: "#334155",
  },
  userSection: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d8dee4",
    marginBottom: 8,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#18202a",
    marginBottom: 8,
  },
  profileButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#eef6ff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 8,
  },
  profileButtonActive: {
    backgroundColor: "#1f6feb",
    borderColor: "#1f6feb",
  },
  profileButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1f6feb",
  },
  profileButtonTextActive: {
    color: "#ffffff",
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fee2e2",
    borderRadius: 4,
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#dc2626",
  },
  menuItem: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  activeMenuItem: {
    backgroundColor: "#0f172a",
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#18202a",
  },
  activeMenuItemText: {
    color: "#ffffff",
  },
  menuSection: {
    gap: 8,
  },
  menuSectionLabel: {
    marginTop: 8,
    paddingHorizontal: 4,
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: "800",
    color: "#667085",
  },
  homeCanvas: {
    flex: 1,
    minHeight: "calc(100vh - 76px)",
    backgroundColor: "#eef2f5",
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#18202a",
  },
  subtle: {
    fontSize: 13,
    color: "#667085",
  },
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "#eef2f5",
  },
  loginBox: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#d8dee4",
  },
  loginTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#18202a",
    textAlign: "center",
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  loginInput: {
    borderWidth: 1,
    borderColor: "#d8dee4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: "#ffffff",
  },
  loginError: {
    color: "#e74c3c",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  loginButton: {
    backgroundColor: "#3498db",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  loginButtonPressed: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  demoText: {
    marginTop: 24,
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    fontStyle: "italic",
  },
});
