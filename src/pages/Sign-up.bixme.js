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
  const imports = { 
    createPaystackPayment: typeof createPaystackPayment, 
    createPayfastPayment: typeof createPayfastPayment,
    getUserPaymentStatus: typeof getUserPaymentStatus,
    sendDiscordLog: typeof sendDiscordLog
  };
  console.log("📦 Imports check:", imports);
  
  // Discord notification about import status
  if (imports.createPayfastPayment !== 'function') {
    sendDiscordLog(`❌ CRITICAL: PayFast payment function not properly imported (type: ${imports.createPayfastPayment})`);
  } else {
    sendDiscordLog(`✅ PayFast payment function loaded successfully`);
  }
  
  // Initialize page elements with error handling
  try { $w("#formContainer").collapse(); } catch (e) { console.log("formContainer not found"); }
  try { $w("#goToDashboardButton").hide(); } catch (e) { console.log("goToDashboardButton not found"); }
  try { $w("#goToSubscriptionButton").hide(); } catch (e) { console.log("goToSubscriptionButton not found"); }
  try { $w("#openSignUp").hide(); } catch (e) { console.log("openSignUp not found"); }
  try { $w("#paystackPayButton").hide(); } catch (e) { console.log("paystackPayButton not found"); }
  try { $w("#payfastPayButton").hide(); } catch (e) { console.log("payfastPayButton not found"); }
  try { $w("#statusText").text = "Checking your sign-up status..."; } catch (e) { console.log("statusText not found"); }

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
  sendDiscordLog(`📊 User status check for ${userId} (${email}): SignUp=${status.hasSignUpPaid}, Subscription=${status.hasSubscription}, Source=${status.signupSource || 'None'}`);

  if (status.error) {
    $w("#statusText").text = "Error checking your status. Please try again later.";
    sendDiscordLog(`❌ Status check failed for ${email}: ${status.error}`);
    return;
  }

  // --- Logic Branching (with error handling) ---
  if (status.hasSignUpPaid && status.hasSubscription) {
    // ✅ SCENARIO 1: Sign up paid AND membership tier selected and confirmed as paid
    // SHOW: goToDashboardButton ONLY
    sendDiscordLog(`✅ SCENARIO 1: User ${userId} (${email}) fully onboarded - showing dashboard button`);
    try { $w("#goToDashboardButton").show(); } catch (e) { console.log("Cannot show goToDashboardButton"); }
    // Payment buttons hidden (sign-up already paid)
    try { $w("#statusText").text = `✅ Welcome back! Sign-up confirmed via ${status.signupSource}. Active ${status.membershipTier} membership.`; } catch (e) { console.log("Cannot update statusText"); }
  } 
  else if (status.hasSignUpPaid && !status.hasSubscription) {
    // ⚠️ SCENARIO 2: Sign up paid and confirmed BUT membership tier NOT selected/paid/confirmed
    // SHOW: goToSubscriptionButton ONLY
    sendDiscordLog(`⚠️ SCENARIO 2: User ${userId} (${email}) signup paid but needs subscription - showing subscription button`);
    try { $w("#goToSubscriptionButton").show(); } catch (e) { console.log("Cannot show goToSubscriptionButton"); }
    // Payment buttons hidden (sign-up already paid)
    if (status.hasMembershipTierSelected) {
      try { $w("#statusText").text = `✅ Sign-up confirmed (${status.signupSource}), but ${status.membershipTier} membership needs payment confirmation.`; } catch (e) { console.log("Cannot update statusText"); }
    } else {
      try { $w("#statusText").text = `✅ Sign-up confirmed (${status.signupSource}), but no membership tier selected yet.`; } catch (e) { console.log("Cannot update statusText"); }
    }
  } 
  else {
    // 📝 SCENARIO 3: Sign up fee NOT paid or cannot be confirmed
    // SHOW: openSignUp AND payment gateway buttons
    sendDiscordLog(`📝 SCENARIO 3: User ${userId} (${email}) needs signup payment - showing payment buttons (PayFast + Paystack)`);
    try { $w("#openSignUp").show(); } catch (e) { console.log("Cannot show openSignUp"); }
    try { $w("#paystackPayButton").show(); } catch (e) { console.log("Cannot show paystackPayButton"); }
    try { 
      $w("#payfastPayButton").show(); 
      console.log("✅ PayFast button shown successfully");
      sendDiscordLog(`✅ PayFast button displayed for user ${userId} (${email}) - signup payment needed`);
    } catch (e) { 
      console.error("❌ Cannot show payfastPayButton:", e); 
      sendDiscordLog(`❌ Failed to show PayFast button for user ${userId} (${email}): ${e.message}`);
    }
    try { $w("#statusText").text = "📝 Please complete your sign-up payment below using Paystack or PayFast."; } catch (e) { console.log("Cannot update statusText"); }
  }

  // --- Button Listeners (with error handling) ---
  try {
    $w("#openSignUp").onClick(() => toggleForm());
  } catch (e) {
    console.log("openSignUp button not found or not available");
  }
  
  try {
    $w("#submitFormButton").onClick(() => handleFormSubmit(userId, email));
  } catch (e) {
    console.log("submitFormButton not found or not available");
  }
  
  try {
    $w("#paystackPayButton").onClick(() => handlePaystackSignup(userId, email));
  } catch (e) {
    console.log("paystackPayButton not found or not available");
  }
  
  try {
    const payfastButton = $w("#payfastPayButton");
    console.log("🔍 PayFast button element:", payfastButton);
    
    payfastButton.onClick(() => {
      console.log("🔥 PayFast button clicked! Initiating payment...");
      sendDiscordLog(`🔥 PayFast button clicked by user ${userId} (${email})`);
      handlePayfastSignup(userId, email);
    });
    console.log("✅ PayFast button onClick handler attached successfully");
    sendDiscordLog(`✅ PayFast button initialized successfully for user ${userId} (${email})`);
  } catch (e) {
    console.error("❌ payfastPayButton not found or not available:", e);
    sendDiscordLog(`❌ PayFast button initialization failed for user ${userId} (${email}): ${e.message}`);
  }
  
  try {
    $w("#goToDashboardButton").onClick(() => wixLocation.to("/dashboard"));
  } catch (e) {
    console.log("goToDashboardButton not found or not available");
  }
  
  try {
    $w("#goToSubscriptionButton").onClick(() => wixLocation.to("/signup-success"));
  } catch (e) {
    console.log("goToSubscriptionButton not found or not available");
  }
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
  console.log("🚀 handlePayfastSignup called with:", { userId, email });
  sendDiscordLog(`🚀 PayFast payment initiation started for user ${userId} (${email})`);
  
  try {
    console.log("📱 Updating status text...");
    try { 
      $w("#statusText").text = "🔗 Redirecting to PayFast...";
      console.log("✅ Status text updated successfully");
    } catch (statusErr) {
      console.error("❌ Failed to update status text:", statusErr);
      sendDiscordLog(`⚠️ PayFast: Failed to update status text for user ${userId}: ${statusErr.message}`);
    }
    
    console.log("🔗 Calling createPayfastPayment...");
    sendDiscordLog(`🔗 PayFast: Generating payment URL for user ${userId} (${email})`);
    
    const url = await createPayfastPayment(userId, email);
    console.log("✅ PayFast URL generated:", url);
    sendDiscordLog(`✅ PayFast payment URL generated successfully for user ${userId}: ${url}`);
    
    console.log("🌐 Redirecting to PayFast URL...");
    wixLocation.to(url);
    console.log("✅ Redirect initiated");
    sendDiscordLog(`🌐 PayFast: User ${userId} redirected to payment gateway successfully`);
    
  } catch (err) {
    console.error("❌ PayFast error:", err);
    console.error("❌ Error details:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    
    // Comprehensive Discord error reporting
    sendDiscordLog(`❌ CRITICAL: PayFast payment initiation failed for user ${userId} (${email})`);
    sendDiscordLog(`❌ PayFast Error Details: ${err.message}`);
    sendDiscordLog(`❌ PayFast Stack Trace: ${err.stack || 'No stack trace available'}`);
    
    try {
      $w("#statusText").text = "❌ Failed to initiate PayFast payment.";
    } catch (statusErr) {
      console.error("❌ Also failed to update error status:", statusErr);
      sendDiscordLog(`❌ PayFast: Also failed to update error status for user ${userId}: ${statusErr.message}`);
    }
    
    try {
      sendDiscordLog(`❌ PayFast initiation failed for user ${userId}: ${err.message}`);
    } catch (logErr) {
      console.error("❌ Failed to send Discord log:", logErr);
    }
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
