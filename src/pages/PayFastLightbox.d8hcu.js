import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import { generatePayFastUrl } from 'backend/payfastUrl.jsw'; // Ensure correct path to your backend file

let userId;

$w.onReady(function () {
  const context = wixWindow.lightbox.getContext();
  userId = context?.userId;

  if (!userId) {
    console.error("❌ Missing userId in lightbox context. Cannot proceed with payment.");
    $w("#confirmBtn").disable(); // Disable the button if userId is missing
    // Display an error message directly on the lightbox if possible
    const messageTextElement = $w("#messageText");
    if (messageTextElement) { // Check if the element exists
      messageTextElement.text = "Error: User information missing. Please close this window and try again.";
      messageTextElement.show();
    }
    return;
  }

  // Initial message for the user
  const messageTextElement = $w("#messageText");
  if (messageTextElement) { // Check if the element exists
    messageTextElement.text = "You will now be redirected to PayFast...";
    messageTextElement.show();
  } else {
    console.warn("Element #messageText not found on PayFastLightbox. Ensure it exists.");
  }

  // Attach the click handler to the confirm button
  $w("#confirmBtn").onClick(handlePaymentRedirect);
});

/**
 * Handles the redirection to the PayFast payment gateway.
 * This function is called when the #confirmBtn is clicked.
 */
async function handlePaymentRedirect() {
  // Optionally show a loading indicator here
  // $w("#loadingIndicator").show(); 

  try {
    // Generate the PayFast URL by calling the backend function
    const payfastUrl = await generatePayFastUrl(userId);
    
    // Close the current lightbox
    wixWindow.lightbox.close();
    
    // Redirect the user's browser to the generated PayFast URL
    wixLocation.to(payfastUrl);
  } catch (error) {
    console.error("❌ Redirect to PayFast failed:", error);
    
    // Hide any loading indicator if it was shown
    // $w("#loadingIndicator").hide();

    // Attempt to display a user-friendly error message
    let errorMessage = "Something went wrong. Please try again.";
    if (error.message && error.message.includes("PayFast integration error")) {
      // If it's a specific error from our backend, use a more general message
      errorMessage = "Payment processing error. Please contact support if the issue persists.";
    } else if (error.message) {
      // For other errors, you might want to show the specific message for debugging,
      // but for users, a generic message is often better.
      // For now, let's keep it generic for the user.
      // console.log("Detailed error for user:", error.message);
    }

    // Display the error message directly on the lightbox if #messageText exists
    const messageTextElement = $w("#messageText");
    if (messageTextElement) { // Check if the element exists
      messageTextElement.text = errorMessage;
      messageTextElement.show();
    } else {
      // Fallback if #messageText is not available or if you prefer a different mechanism
      console.error("Could not display error message on lightbox. Error was:", errorMessage);
      // You could also consider a wix-window.openLightbox("ErrorPopup", { message: errorMessage });
      // but ensure "ErrorPopup" lightbox actually exists.
    }
  }
}
