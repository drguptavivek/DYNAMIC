export const FIELD_APP_ROUTES = {
  home: "/",
  worklist: "/worklist",
  sync: "/sync",
  draftPendingForms: "/draft-pending-forms",
  completedForms: "/completed-forms",
  uploadedForms: "/uploaded-forms",
  households: "/households",
  householdNew: "/households/new",
  householdMembers: "/household-members",
  householdMembersForHousehold: (householdId) =>
    `/household-members/${encodeURIComponent(householdId)}`,
  profile: "/profile",
  questionnaire: (formCode) => `/questionnaires/${encodeURIComponent(formCode)}`,
  questionnaireNew: (formCode) => `/questionnaires/${encodeURIComponent(formCode)}/new`,
};

export const FORM_OPEN_POLICY = {
  globalFormMenuEnabled: false,
  allowedSources: ["scheduled_task", "event_triggered_task", "contextual_action"],
};

export const SHELL_NAV_ITEMS = [
  { id: "worklist", label: "Worklist", route: FIELD_APP_ROUTES.worklist },
  { id: "sync", label: "Sync", route: FIELD_APP_ROUTES.sync },
  { id: "draftPendingForms", label: "Draft/Pending Forms", route: FIELD_APP_ROUTES.draftPendingForms },
  { id: "completedForms", label: "Completed Forms", route: FIELD_APP_ROUTES.completedForms },
  { id: "uploadedForms", label: "Uploaded Forms", route: FIELD_APP_ROUTES.uploadedForms },
  { id: "households", label: "Households", route: FIELD_APP_ROUTES.households },
  {
    id: "householdMembers",
    label: "Household Members",
    route: FIELD_APP_ROUTES.householdMembers,
  },
  { id: "profile", label: "Profile", route: FIELD_APP_ROUTES.profile },
];

export function getRouteForTaskForm(task) {
  if (!task?.task_type) {
    throw new Error("Cannot open a form route without a valid task context");
  }
  const route = FIELD_APP_ROUTES.questionnaireNew(task.task_type);
  const taskId = task.id || task.task_id || task.task_key;
  const params = [];
  if (taskId) params.push(`taskId=${encodeURIComponent(taskId)}`);
  if (task.active_draft_id) params.push(`draftId=${encodeURIComponent(task.active_draft_id)}`);
  if (params.length) params.push(`openKey=${Date.now()}`);
  return params.length ? `${route}?${params.join("&")}` : route;
}
