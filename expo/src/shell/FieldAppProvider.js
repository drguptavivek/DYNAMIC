import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { AppState } from "react-native";

import { getHouseholdContextSync } from "../lib/householdSync.js";
import { buildPrefillForTask } from "../lib/prefillMapper.js";
import * as appLockStore from "../modules/auth/appLockStore.js";
import * as authStore from "../modules/auth/authStore.js";
import { initializeHouseholdRepository, listLocalities } from "../modules/households/householdRepository.js";
import * as syncService from "../modules/sync/syncService.js";
import { initTaskDb } from "../modules/tasks/taskSchema.js";
import { getRouteForTaskForm } from "../navigation/appNavigation.js";
import { setNavigationHandler } from "../navigation/routes.js";

const FieldAppContext = createContext(null);

export function FieldAppProvider({ children }) {
  const router = useRouter();
  const [locale, setLocale] = useState("default");
  const [user, setUser] = useState(null);
  const [taskDbReady, setTaskDbReady] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskWorklistRevision, setTaskWorklistRevision] = useState(0);
  const [currentTaskContext, setCurrentTaskContext] = useState(null);
  const [prefillData, setPrefillData] = useState(null);
  const [readOnlyFields, setReadOnlyFields] = useState(null);
  const [selectedLocalityCode, setSelectedLocalityCode] = useState("");
  const [localities, setLocalities] = useState([]);
  const [clockStatus, setClockStatus] = useState(null);
  const [appLockReady, setAppLockReady] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const [appLockConfigured, setAppLockConfigured] = useState(false);
  const [appLockBiometricAvailable, setAppLockBiometricAvailable] = useState(false);

  useEffect(() => {
    setNavigationHandler((route) => router.push(route));
    return () => setNavigationHandler(null);
  }, [router]);

  useEffect(() => {
    async function initApp() {
      try {
        initTaskDb();
        setTaskDbReady(true);

        const restoreUser = await authStore.restoreSession();
        if (restoreUser) {
          setUser(restoreUser);
          await initializeAppLock(restoreUser, { afterLogin: false });
        } else {
          setAppLockReady(true);
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
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && user && appLockConfigured) {
        setAppLocked(true);
      }
    });
    return () => subscription.remove();
  }, [user, appLockConfigured]);

  async function refreshLocalities() {
    await initializeHouseholdRepository();
    setLocalities(await listLocalities());
  }

  async function login(username, password) {
    const result = await authStore.login(username, password);
    if (result.ok) {
      setUser(result.user);
      await initializeAppLock(result.user, { afterLogin: true });
    }
    return result;
  }

  function logout() {
    authStore.logout();
    setUser(null);
    setAppLocked(false);
    setAppLockConfigured(false);
    setAppLockReady(true);
    clearFormContext();
  }

  async function initializeAppLock(nextUser, options = {}) {
    const configured = await appLockStore.isLockConfiguredForUser(nextUser);
    const biometricStatus = await appLockStore.getBiometricStatus();
    setAppLockConfigured(configured);
    setAppLockBiometricAvailable(Boolean(biometricStatus.available && biometricStatus.enrolled));
    setAppLocked(configured ? !options.afterLogin : true);
    setAppLockReady(true);
  }

  async function configureAppLock(pin, options = {}) {
    if (!user) {
      return { ok: false, error: "Login is required before setting an app lock" };
    }
    try {
      await appLockStore.configureLockForUser(user, pin, {
        biometricEnabled: options.biometricEnabled && appLockBiometricAvailable,
      });
      setAppLockConfigured(true);
      setAppLocked(false);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async function unlockAppWithPin(pin) {
    if (!user) return { ok: false, error: "Login is required" };
    const ok = await appLockStore.verifyPinForUser(user, pin);
    if (ok) {
      setAppLocked(false);
      return { ok: true };
    }
    return { ok: false, error: "PIN did not match" };
  }

  async function unlockAppWithBiometrics() {
    if (!user) return { ok: false, error: "Login is required" };
    const result = await appLockStore.unlockWithBiometrics(user);
    if (result.ok) {
      setAppLocked(false);
      return { ok: true };
    }
    return { ok: false, error: "Biometric unlock was not completed" };
  }

  function clearFormContext() {
    setCurrentTaskContext(null);
    setPrefillData(null);
    setReadOnlyFields(null);
    setClockStatus(syncService.getClockStatus());
  }

  function openTask(task) {
    setSelectedTask(task);
    setShowTaskModal(true);
  }

  function closeTaskModal() {
    setShowTaskModal(false);
  }

  function notifyTaskWorklistChanged() {
    setTaskWorklistRevision((revision) => revision + 1);
  }

  function openFormFromTask(task) {
    if (!task) return;
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

    router.push(getRouteForTaskForm(task));
  }

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      user,
      login,
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
      appLockReady,
      appLocked,
      appLockConfigured,
      appLockBiometricAvailable,
      configureAppLock,
      unlockAppWithPin,
      unlockAppWithBiometrics,
    }),
    [
      locale,
      user,
      taskDbReady,
      selectedTask,
      showTaskModal,
      taskWorklistRevision,
      currentTaskContext,
      prefillData,
      readOnlyFields,
      selectedLocalityCode,
      localities,
      clockStatus,
      appLockReady,
      appLocked,
      appLockConfigured,
      appLockBiometricAvailable,
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
