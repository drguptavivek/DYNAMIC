import * as taskRepository from "../tasks/taskRepository.js";
import {
  listTaskWorklist as listTaskWorklistWithRepository,
  reconcilePulledTasks as reconcilePulledTasksWithRepository,
} from "./taskWorklist.js";

export function listTaskWorklist(filters = {}) {
  return listTaskWorklistWithRepository(filters, taskRepository);
}

export function reconcilePulledTasks(tasks = []) {
  return reconcilePulledTasksWithRepository(tasks, taskRepository);
}
