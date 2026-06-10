import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";

import { getHouseholdContextSync } from "../lib/householdSync.js";
import { buildPrefillForTask } from "../lib/prefillMapper.js";
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
  const [currentTaskContext, setCurrentTaskContext] = useState(null);
  const [prefillData, setPrefillData] = useState(null);
  const [readOnlyFields, setReadOnlyFields] = useState(null);
  const [selectedLocalityCode, setSelectedLocalityCode] = useState("");
  const [localities, setLocalities] = useState([]);
  const [clockStatus, setClockStatus] = useState(null);

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
        }

        await refreshLocalities();
        setClockStatus(syncService.getClockStatus());
      } catch (error) {
        console.error("App init error:", error);
      }
    }

    initApp();
  }, []);

  async function refreshLocalities() {
    await initializeHouseholdRepository();
    setLocalities(await listLocalities());
  }

  async function login(username, password) {
    const result = await authStore.login(username, password);
    if (result.ok) {
      setUser(result.user);
    }
    return result;
  }

  function logout() {
    authStore.logout();
    setUser(null);
    clearFormContext();
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
      closeTaskModal,
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
    }),
    [
      locale,
      user,
      taskDbReady,
      selectedTask,
      showTaskModal,
      currentTaskContext,
      prefillData,
      readOnlyFields,
      selectedLocalityCode,
      localities,
      clockStatus,
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
