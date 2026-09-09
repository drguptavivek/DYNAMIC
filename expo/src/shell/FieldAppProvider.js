import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, AppState } from "react-native";

import { getHouseholdContextSync } from "../lib/householdSync.js";
import { buildPrefillForTask } from "../lib/prefillMapper.js";
import * as appLockStore from "../modules/auth/appLockStore.js";
import * as authStore from "../modules/auth/authStore.js";
import { initializeHouseholdRepository, listLocalities } from "../modules/households/householdRepository.js";
import {
  getActiveQuestionnaireDraft,
  getQuestionnaireDraftById,
  listActiveQuestionnaireDraftSummaries,
} from "../modules/questionnaires/questionnaireDraftRepository.js";
import { draftMatchesTask } from "../modules/questionnaires/draftPendingForms.js";
import * as syncService from "../modules/sync/syncService.js";
import { initTaskDb } from "../modules/tasks/taskSchema.js";
import { getTask } from "../modules/tasks/taskRepository.js";
import { getRouteForTaskForm } from "../navigation/appNavigation.js";
import { setNavigationHandler } from "../navigation/routes.js";
import { loadLocalePreference, saveLocalePreference } from "../modules/preferences/localePreference.js";
import { evaluateDeviceClock } from "../modules/sync/trustedClock.js";
import { configurePerfLog, startTiming } from "../lib/perfLog.js";
import * as Application from "expo-application";
import { stabilizeClockGuard } from "./fieldAppProviderStability.js";

const FieldAppContext = createContext(null);

export function FieldAppProvider({ children }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState("default");
  // The chosen questionnaire language is a device preference: every form
  // opens in it until it is switched again, including after a restart.
  const setLocale = useCallback((nextLocale) => {
    const normalized = String(nextLocale || "default");
    setLocaleState(normalized);
    saveLocalePreference(normalized);
  }, []);
  const [user, setUser] = useState(null);
  const [taskDbReady, setTaskDbReady] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const openTaskIdRef = useRef(null);
  const [taskWorklistRevision, setTaskWorklistRevision] = useState(0);
  const [currentTaskContext, setCurrentTaskContext] = useState(null);
  const [prefillData, setPrefillData] = useState(null);
  const [readOnlyFields, setReadOnlyFields] = useState(null);
  const [selectedLocalityCode, setSelectedLocalityCode] = useState("");
  const [localities, setLocalities] = useState([]);
  const [clockStatus, setClockStatus] = useState(null);
  // Device clock guard: "blocked" when the clock has been moved back (or is
  // far behind the server), "warning" when far ahead. See trustedClock.js.
  const [clockGuard, setClockGuard] = useState({ status: "ok", message: "", skewMs: 0 });
  const refreshClockGuard = useCallback(async () => {
    try {
      const status = syncService.getClockStatus();
      const result = await evaluateDeviceClock({
        serverDeltaMs: typeof status?.deltaMs === "number" ? status.deltaMs : null,
      });
      setClockGuard((previous) => stabilizeClockGuard(previous, result));
      return result;
    } catch (error) {
      console.warn("Could not evaluate device clock:", error);
      return { status: "ok", message: "", skewMs: 0 };
    }
  }, []);
  const [appLockReady, setAppLockReady] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const [appLockConfigured, setAppLockConfigured] = useState(false);
  const [appLockBiometricAvailable, setAppLockBiometricAvailable] = useState(false);
  const [appLockBiometricEnabled, setAppLockBiometricEnabled] = useState(false);

  const initializeAppLock = useCallback(async (nextUser, options = {}) => {
    const configured = await appLockStore.isLockConfiguredForUser(nextUser);
    const biometricStatus = await appLockStore.getBiometricStatus();
    const biometricEnabled = await appLockStore.isBiometricUnlockEnabledForUser(nextUser);
    const biometricAvailable = Boolean(biometricStatus.available && biometricStatus.enrolled);
    setAppLockConfigured(configured);
    setAppLockBiometricAvailable(biometricAvailable);
    setAppLockBiometricEnabled(Boolean(configured && biometricEnabled && biometricAvailable));
    setAppLocked(configured ? !options.afterLogin : true);
    setAppLockReady(true);
  }, []);

  const clearFormContext = useCallback(() => {
    setCurrentTaskContext(null);
    setPrefillData(null);
    setReadOnlyFields(null);
    setClockStatus(syncService.getClockStatus());
  }, []);

  const refreshLocalities = useCallback(async () => {
    await initializeHouseholdRepository();
    setLocalities(await listLocalities());
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await authStore.login(username, password);
    if (result.ok) {
      setUser(result.user);
      await initializeAppLock(result.user, { afterLogin: true });
    }
    return result;
  }, [initializeAppLock]);

  const loginWithQrPayload = useCallback(async (qrPayload) => {
    const result = await authStore.loginWithQrPayload(qrPayload);
    if (result.ok) {
      setUser(result.user);
      await initializeAppLock(result.user, { afterLogin: true });
    }
    return result;
  }, [initializeAppLock]);

  const logout = useCallback(async () => {
    const logoutUser = user;
    try {
      await appLockStore.clearLockForUser(logoutUser);
    } catch (error) {
      console.warn("Could not clear app lock during logout:", error);
    }
    await authStore.logout();
    setUser(null);
    setAppLocked(false);
    setAppLockConfigured(false);
    setAppLockBiometricEnabled(false);
    setAppLockReady(true);
    setSelectedTask(null);
    setShowTaskModal(false);
    openTaskIdRef.current = null;
    setTaskWorklistRevision((revision) => revision + 1);
    setSelectedLocalityCode("");
    setLocalities([]);
    clearFormContext();
  }, [clearFormContext, user]);

  const configureAppLock = useCallback(async (pin, options = {}) => {
    if (!user) {
      return { ok: false, error: "Login is required before setting an app lock" };
    }
    try {
      const record = await appLockStore.configureLockForUser(user, pin, {
        biometricEnabled: Boolean(options.biometricEnabled && appLockBiometricAvailable),
      });
      setAppLockConfigured(true);
      setAppLockBiometricEnabled(Boolean(record.biometric_enabled && appLockBiometricAvailable));
      setAppLocked(false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }, [appLockBiometricAvailable, user]);

  const unlockAppWithPin = useCallback(async (pin) => {
    if (!user) return { ok: false, error: "Login is required" };
    const ok = await appLockStore.verifyPinForUser(user, pin);
    if (ok) {
      setAppLocked(false);
      return { ok: true };
    }
    return { ok: false, error: "PIN did not match" };
  }, [user]);

  const unlockAppWithBiometrics = useCallback(async () => {
    if (!user) return { ok: false, error: "Login is required" };
    const result = await appLockStore.unlockWithBiometrics(user);
    if (result.ok) {
      setAppLocked(false);
      return { ok: true };
    }
    if (result.reason === "not_configured") {
      setAppLockBiometricEnabled(false);
      return { ok: false, error: "Biometric unlock is not enabled for this app PIN" };
    }
    if (result.reason === "unavailable") {
      setAppLockBiometricAvailable(false);
      setAppLockBiometricEnabled(false);
      return { ok: false, error: "Biometric unlock is not available on this device" };
    }
    return { ok: false, error: "Biometric unlock was not completed" };
  }, [user]);

  const unlockAppWithPassword = useCallback(async (password) => {
    if (!user) return { ok: false, error: "Login is required" };
    const username = user.username || user.email;
    if (!username || !password) {
      return { ok: false, error: "Enter your login password" };
    }

    const result = await authStore.login(username, password);
    if (!result.ok) {
      return { ok: false, error: result.error || "Password did not match" };
    }

    setUser(result.user);
    setAppLocked(false);
    return { ok: true };
  }, [user]);

  const changeAppPinWithPassword = useCallback(async (password, newPin) => {
    if (!user) return { ok: false, error: "Login is required" };
    const username = user.username || user.email;
    if (!username || !password) {
      return { ok: false, error: "Enter your login password" };
    }

    const loginResult = await authStore.login(username, password);
    if (!loginResult.ok) {
      return { ok: false, error: loginResult.error || "Password did not match" };
    }

    try {
      const existingRecord = await appLockStore.readLockRecord();
      const lockUserId = appLockStore.getLockUserId(loginResult.user);
      const record = await appLockStore.configureLockForUser(loginResult.user, newPin, {
        biometricEnabled: Boolean(
          existingRecord?.user_id === lockUserId && existingRecord.biometric_enabled,
        ),
      });
      setUser(loginResult.user);
      setAppLockConfigured(true);
      setAppLockBiometricEnabled(Boolean(record.biometric_enabled && appLockBiometricAvailable));
      setAppLocked(false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }, [appLockBiometricAvailable, user]);

  const setAppLockBiometricPreference = useCallback(async (enabled) => {
    if (!user) return { ok: false, error: "Login is required" };
    const result = await appLockStore.setBiometricUnlockForUser(user, enabled);
    if (!result.ok) {
      if (result.reason === "not_configured") {
        setAppLockBiometricEnabled(false);
        return { ok: false, error: "Create an app PIN before enabling biometric unlock" };
      }
      if (result.reason === "unavailable") {
        setAppLockBiometricAvailable(false);
        setAppLockBiometricEnabled(false);
        return { ok: false, error: "Biometric unlock is not available on this device" };
      }
      return { ok: false, error: "Could not update biometric unlock" };
    }
    const nextEnabled = Boolean(result.record?.biometric_enabled && appLockBiometricAvailable);
    setAppLockBiometricEnabled(nextEnabled);
    return { ok: true, enabled: nextEnabled };
  }, [appLockBiometricAvailable, user]);

  const openTask = useCallback((task) => {
    if (!task) return;
    const taskId = task.id || task.task_id || task.task_key;
    if (openTaskIdRef.current) return;
    openTaskIdRef.current = taskId || "open";
    setSelectedTask(task);
    setShowTaskModal(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setShowTaskModal(false);
    setSelectedTask(null);
    openTaskIdRef.current = null;
  }, []);

  const notifyTaskWorklistChanged = useCallback(() => {
    setTaskWorklistRevision((revision) => revision + 1);
  }, []);

  const resolveActiveDraftForTask = useCallback(async (task) => {
    if (!task) return null;
    const existingDraft = await getQuestionnaireDraftById(task.active_draft_id);
    if (existingDraft) return existingDraft;
    const currentUserId = String(user?.user_id || user?.id || user?.username || "dev-user");
    const matchingDraft = (await listActiveQuestionnaireDraftSummaries()).find(
      (draft) => String(draft.user_id || "") === currentUserId && draftMatchesTask(draft, task),
    );
    if (matchingDraft) return matchingDraft;
    return getActiveQuestionnaireDraft({
      formCode: task.task_type,
      formVersion: task.form_version || task.questionnaire_version || "9 MAY 2026",
      taskId: task.id || task.task_id || task.task_key || null,
      keyTaskId: null,
      subjectType: task.subject_type || (task.household_id ? "household" : "locality"),
      subjectId: task.household_id || task.subject_id || task.task_key || "unselected",
      deviceId: user?.device_id || "dev-device",
      userId: user?.user_id || user?.id || user?.username || "dev-user",
    });
  }, [user]);

  const openFormFromTask = useCallback(async (task) => {
    if (!task) return;
    const guard = await refreshClockGuard();
    if (guard.status === "blocked") {
      Alert.alert("Correct device date and time", guard.message);
      return;
    }
    setShowTaskModal(false);
    setSelectedTask(null);
    openTaskIdRef.current = null;

    const freshTask = getTask(task.id || task.task_id || task.task_key) || task;
    const activeDraft = await resolveActiveDraftForTask({
      ...freshTask,
      active_draft_id: task.active_draft_id,
    });
    const taskForOpen = {
      ...freshTask,
      active_draft_id: activeDraft?.draft_id || task.active_draft_id || null,
    };
    if (taskForOpen.household_id) {
      try {
        const context = getHouseholdContextSync(taskForOpen.household_id, taskForOpen.subject_id);
        const { prefill, readOnlyFields: roFields } = buildPrefillForTask(
          taskForOpen,
          context.household,
          context.member,
        );

        setCurrentTaskContext(taskForOpen);
        setPrefillData(prefill);
        setReadOnlyFields(roFields);
      } catch (error) {
        console.error("Error fetching task context:", error);
        setCurrentTaskContext(taskForOpen);
        setPrefillData(null);
        setReadOnlyFields(null);
      }
    } else {
      setCurrentTaskContext(taskForOpen);
      setPrefillData(null);
      setReadOnlyFields(null);
    }

    router.push(getRouteForTaskForm(taskForOpen));
  }, [refreshClockGuard, resolveActiveDraftForTask, router]);

  useEffect(() => {
    setNavigationHandler((route, options = {}) => {
      if (options.replace !== false) {
        router.replace(route);
        return;
      }
      router.push(route);
    });
    return () => setNavigationHandler(null);
  }, [router]);

  useEffect(() => {
    async function initApp() {
      const endInit = startTiming("app.init");
      try {
        configurePerfLog({ appVersion: Application.nativeApplicationVersion || "" });
        initTaskDb();
        setTaskDbReady(true);
        setLocaleState(await loadLocalePreference());
        await refreshClockGuard();

        const restoreUser = await authStore.restoreSession();
        if (restoreUser) {
          setUser(restoreUser);
          await initializeAppLock(restoreUser, { afterLogin: false });
        } else {
          setAppLockReady(true);
        }

        await refreshLocalities();
        setClockStatus(syncService.getClockStatus());
        endInit({ ok: true, loggedIn: Boolean(restoreUser) });
      } catch (error) {
        console.error("App init error:", error);
        endInit({ ok: false });
      }
    }

    initApp();
  }, [initializeAppLock, refreshClockGuard, refreshLocalities]);

  useEffect(() => {
    configurePerfLog({ deviceId: user?.device_id || "" });
  }, [user?.device_id]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && user && appLockConfigured) {
        setAppLocked(true);
      }
      if (nextState === "active") {
        // Coming back from Settings is exactly when the date may have changed.
        refreshClockGuard();
      }
    });
    return () => subscription.remove();
  }, [user, appLockConfigured, refreshClockGuard]);

  // Re-check periodically while the app is open, and whenever a sync brings
  // a fresh server/device delta.
  useEffect(() => {
    const interval = setInterval(() => {
      refreshClockGuard();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshClockGuard]);
  useEffect(() => {
    refreshClockGuard();
  }, [clockStatus, refreshClockGuard]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      user,
      login,
      loginWithQrPayload,
      logout,
      taskDbReady,
      selectedTask,
      showTaskModal,
      taskWorklistRevision,
      closeTaskModal,
      notifyTaskWorklistChanged,
      openTask,
      openFormFromTask,
      currentTaskContext,
      prefillData,
      readOnlyFields,
      clearFormContext,
      selectedLocalityCode,
      setSelectedLocalityCode,
      localities,
      refreshLocalities,
      clockStatus,
      setClockStatus,
      clockGuard,
      refreshClockGuard,
      appLockReady,
      appLocked,
      appLockConfigured,
      appLockBiometricAvailable,
      appLockBiometricEnabled,
      configureAppLock,
      unlockAppWithPin,
      unlockAppWithBiometrics,
      unlockAppWithPassword,
      changeAppPinWithPassword,
      setAppLockBiometricPreference,
    }),
    [
      locale,
      setLocale,
      user,
      login,
      loginWithQrPayload,
      logout,
      taskDbReady,
      selectedTask,
      showTaskModal,
      taskWorklistRevision,
      closeTaskModal,
      notifyTaskWorklistChanged,
      openTask,
      openFormFromTask,
      currentTaskContext,
      prefillData,
      readOnlyFields,
      clearFormContext,
      selectedLocalityCode,
      localities,
      clockStatus,
      clockGuard,
      refreshClockGuard,
      refreshLocalities,
      appLockReady,
      appLocked,
      appLockConfigured,
      appLockBiometricAvailable,
      appLockBiometricEnabled,
      configureAppLock,
      unlockAppWithPin,
      unlockAppWithBiometrics,
      unlockAppWithPassword,
      changeAppPinWithPassword,
      setAppLockBiometricPreference,
    ],
  );

  return <FieldAppContext.Provider value={value}>{children}</FieldAppContext.Provider>;
}

export function useFieldApp() {
  const context = useContext(FieldAppContext);
  if (!context) {
    throw new Error("useFieldApp must be used inside FieldAppProvider");
  }
  return context;
}
