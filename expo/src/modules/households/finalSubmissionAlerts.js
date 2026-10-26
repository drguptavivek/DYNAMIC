import { showFormAlert } from "../../lib/nativeFormPopups.js";
export const FINAL_SUBMISSION_CONFIRMATION_MESSAGE =
  "Are you sure you want to final submit this form?";

export function requestFinalSubmissionConfirmation({ showAlert, onConfirm, onCancel, survey }) {
  let answered = false;
  const answer = (callback) => {
    if (answered) return;
    answered = true;
    callback?.();
  };
  showFormAlert(survey, showAlert, "Final submission", FINAL_SUBMISSION_CONFIRMATION_MESSAGE, [
    {
      text: "No",
      style: "cancel",
      onPress: () => answer(onCancel),
    },
    {
      text: "Yes",
      onPress: () => answer(onConfirm),
    },
  ], { onDismiss: () => answer(onCancel) });
}

export function waitForSubmissionAcknowledgement(showAlert, survey) {
  return new Promise((resolve) => {
    showFormAlert(survey, showAlert,
      "Form is submitted",
      "",
      [
        {
          text: "OK",
          onPress: resolve,
        },
      ],
      { cancelable: false },
    );
  });
}
