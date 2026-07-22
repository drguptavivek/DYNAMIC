import * as taskRepository from "../tasks/taskRepository.js";
import {
  saveEligibleWomanWorkflow as saveEligibleWomanWorkflowWithRepository,
  saveProvisionalPregnancyWorkflow as saveProvisionalPregnancyWorkflowWithRepository,
  saveProvisionalTasks as saveProvisionalTasksWithRepository,
  listTaskWorklist as listTaskWorklistWithRepository,
  reconcilePulledTasks as reconcilePulledTasksWithRepository,
} from "./taskWorklist.js";

export function listTaskWorklist(filters = {}) {
  return listTaskWorklistWithRepository(filters, taskRepository);
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
