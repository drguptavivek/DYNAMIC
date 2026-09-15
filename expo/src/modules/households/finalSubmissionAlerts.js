export const FINAL_SUBMISSION_CONFIRMATION_MESSAGE =
  "Are you sure you want to final submit this form?";

export function requestFinalSubmissionConfirmation({ showAlert, onConfirm }) {
  showAlert("Final submission", FINAL_SUBMISSION_CONFIRMATION_MESSAGE, [
    {
      text: "No",
      style: "cancel",
    },
    {
      text: "Yes",
      onPress: onConfirm,
    },
  ]);
}

export function waitForSubmissionAcknowledgement(showAlert) {
  return new Promise((resolve) => {
    showAlert(
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
