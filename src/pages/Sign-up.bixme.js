// === Sign-up Page Logic ===
// Handles Sign-up flow for EmergiTag (Paystack + PayFast)

// Imports
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { createPaystackPayment } from 'backend/paystack.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';
import { getUserPaymentStatus } from 'backend/status.jsw';
import { sendDiscordLog } from 'backend/logger.jsw';

// === Element IDs ===
// #goToDashboardButton
// #goToSubscriptionButton
// #openSignUp
// #paystackPayButton
// #payfastPayButton
// #formContainer
// #statusText
// #firstNameField
// #lastNameField
// #inputEmail
// #phoneField
// #addressField
// #deliveryAddress

$w.onReady(async () => {
  console.log("🚀 Sign-up page ready...");
  $w("#formContainer").collapse();
  $w("#goToDashboardButton").hide();
  $w("#goToSubscriptionButton").hide();
  $w("#openSignUp").hide();
  $w("#statusText").text = "Checking your sign-up status...";

  const user = wixUsers.currentUser;
  if (!user.loggedIn) {
    $w("#statusText").text = "⚠️ Please log in to continue.";
    return;
  }

  const email = await user.getEmail();
  const userId = user.id;

  // 🔍 Step 1: Check payment + subscription status
  const status = await getUserPaymentStatus(userId, email);
  console.log("📊 Payment status:", status);

  if (status.error) {
    $w("#statusText").text = "Error checking your status. Please try again later.";
    sendDiscordLog(`❌ Status check failed for ${email}: ${status.error}`);
    return;
  }

  // --- Logic Branching ---
  if (status.hasSignUpPaid && status.hasSubscription) {
    // ✅ User fully onboarded
    $w("#goToDashboardButton").show();
    $w("#statusText").text = `✅ Welcome back! Sign-up confirmed via ${status.signupSource} on ${formatDate(status.signupDate)}.`;
  } 
  else if (status.hasSignUpPaid && !status.hasSubscription) {
    // ⚠️ Sign-up done, but no subscription yet
    $w("#goToSubscriptionButton").show();
    $w("#statusText").text = `✅ Sign-up confirmed (${status.signupSource}), but no active subscription found.`;
  } 
  else {
    // 📝 No payment yet
    $w("#openSignUp").show();
    $w("#statusText").text = "📝 Please complete your sign-up below.";
  }

  // --- Button Listeners ---
  $w("#openSignUp").onClick(() => toggleForm());
  $w("#submitFormButton").onClick(() => handleFormSubmit(userId, email));
  $w("#paystackPayButton").onClick(() => handlePaystackSignup(userId, email));
  $w("#payfastPayButton").onClick(() => handlePayfastSignup(userId, email));

  $w("#goToDashboardButton").onClick(() => wixLocation.to("/dashboard"));
  $w("#goToSubscriptionButton").onClick(() => wixLocation.to("/signup-success"));
});

/* === Helper: Animate Form Container === */
function toggleForm() {
  if ($w("#formContainer").collapsed) {
    $w("#formContainer").expand()
      .then(() => $w("#formContainer").show("slide", { direction: "left", duration: 500 }));
  } else {
    $w("#formContainer").hide("slide", { direction: "right", duration: 400 })
      .then(() => $w("#formContainer").collapse());
  }
}

/* === Handle Paystack Payment === */
async function handlePaystackSignup(userId, email) {
  try {
    $w("#statusText").text = "🔗 Redirecting to Paystack...";
    const url = await createPaystackPayment(userId, email);
    wixLocation.to(url);
  } catch (err) {
    console.error("❌ Paystack error:", err);
    $w("#statusText").text = "❌ Failed to initiate Paystack payment.";
    sendDiscordLog("❌ Paystack initiation failed: " + err.message);
  }
}

/* === Handle PayFast Payment === */
async function handlePayfastSignup(userId, email) {
  try {
    $w("#statusText").text = "🔗 Redirecting to PayFast...";
    const url = await createPayfastPayment(userId, email);
    wixLocation.to(url);
  } catch (err) {
    console.error("❌ PayFast error:", err);
    $w("#statusText").text = "❌ Failed to initiate PayFast payment.";
    sendDiscordLog("❌ PayFast initiation failed: " + err.message);
  }
}

/* === Save Profile Info to CMS === */
async function handleFormSubmit(userId, email) {
  const profile = {
    _owner: userId,
    firstName: $w("#firstNameField").value,
    lastName: $w("#lastNameField").value,
    email: $w("#inputEmail").value || email,
    phone: $w("#phoneField").value,
    address: $w("#addressField").value,
    deliveryAddress: $w("#deliveryAddress").value,
  };

  try {
    const existing = await wixData.query("Emergency_Profiles")
      .eq("_owner", userId)
      .limit(1)
      .find();

    if (existing.items.length > 0) {
      const old = existing.items[0];
      Object.assign(old, profile);
      await wixData.update("Emergency_Profiles", old);
      $w("#statusText").text = "✅ Profile updated successfully!";
    } else {
      await wixData.insert("Emergency_Profiles", profile);
      $w("#statusText").text = "✅ Profile saved successfully!";
    }

    sendDiscordLog(`✅ Profile saved for ${email}`);
  } catch (err) {
    console.error("❌ Error saving profile:", err);
    $w("#statusText").text = "❌ Could not save your profile. Please try again.";
    sendDiscordLog("❌ Profile save error: " + err.message);
  }
}

/* === Utility === */
function formatDate(date) {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}
