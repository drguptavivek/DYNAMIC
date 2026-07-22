import * as taskRepository from "../tasks/taskRepository.js";
import {
  saveEligibleWomanWorkflow as saveEligibleWomanWorkflowWithRepository,
  saveProvisionalPregnancyWorkflow as saveProvisionalPregnancyWorkflowWithRepository,
  saveProvisionalTasks as saveProvisionalTasksWithRepository,
  listTaskAttempts as listTaskAttemptsWithRepository,
  listTaskWorklist as listTaskWorklistWithRepository,
  recordFailedTaskAttempt as recordFailedTaskAttemptWithRepository,
  reconcilePulledTasks as reconcilePulledTasksWithRepository,
} from "./taskWorklist.js";

export function listTaskWorklist(filters = {}) {
  return listTaskWorklistWithRepository(filters, taskRepository);
}

export function listTaskAttempts(taskId) {
  return listTaskAttemptsWithRepository(taskId, taskRepository);
}

export function recordFailedTaskAttempt({ task, attempt } = {}) {
  return recordFailedTaskAttemptWithRepository({ task, attempt }, taskRepository);
}

export function reconcilePulledTasks(tasks = []) {
  return reconcilePulledTasksWithRepository(tasks, taskRepository);
}

export function saveProvisionalTasks(tasks = []) {
  return saveProvisionalTasksWithRepository(tasks, taskRepository);
}

export function saveEligibleWomanWorkflow(derivedRows = []) {
  return saveEligibleWomanWorkflowWithRepository(derivedRows, taskRepository);
}

export function saveProvisionalPregnancyWorkflow({ pregnancy, tasks = [] } = {}) {
  return saveProvisionalPregnancyWorkflowWithRepository({ pregnancy, tasks }, taskRepository);
}
