// === Sign-up Page Logic ===
// Handles Sign-up flow for EmergiTag (Paystack + PayFast)

// Imports
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import wixWindow from 'wix-window';
import wixData from 'wix-data';
import { createPaystackPayment } from 'backend/paystack.jsw';
import { createPayfastPayment, testPayfastConnection } from 'backend/payfast.jsw';
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
    testPayfastConnection: typeof testPayfastConnection,
    getUserPaymentStatus: typeof getUserPaymentStatus,
    sendDiscordLog: typeof sendDiscordLog
  };
  console.log("📦 Imports check:", imports);
  
  // Test PayFast backend connection
  try {
    const testResult = await testPayfastConnection();
    sendDiscordLog(`✅ PayFast backend test passed: ${testResult}`);
  } catch (testError) {
    sendDiscordLog(`❌ PayFast backend test failed: ${testError.message}`);
  }
  
  // Discord notification about import status
  if (imports.createPayfastPayment !== 'function') {
    sendDiscordLog(`❌ CRITICAL: PayFast payment function not properly imported (type: ${imports.createPayfastPayment})`);
    sendDiscordLog(`🔍 Available methods on createPayfastPayment: ${Object.getOwnPropertyNames(createPayfastPayment || {})}`);
  } else {
    sendDiscordLog(`✅ PayFast payment function loaded successfully (function length: ${createPayfastPayment.length} parameters)`);
  }
  
  // Helper function to safely manipulate elements
  function safeElementAction(elementId, action, description) {
    try {
      const elements = $w(elementId);
      if (elements && elements.length > 0) {
        const element = elements[0];
        if (element) {
          action(element);
          console.log(`✅ ${description} action completed`);
          return true;
        }
      }
      console.log(`⚠️ ${description} element not found`);
      return false;
    } catch (e) {
      console.error(`❌ ${description} action failed:`, e);
      return false;
    }
  }

  // Initialize page elements with robust error handling
  safeElementAction("#formContainer", (el) => el.collapse(), "formContainer collapse");
  safeElementAction("#goToDashboardButton", (el) => el.hide(), "goToDashboardButton hide");
  safeElementAction("#goToSubscriptionButton", (el) => el.hide(), "goToSubscriptionButton hide");
  safeElementAction("#openSignUp", (el) => el.hide(), "openSignUp hide");
  safeElementAction("#paystackPayButton", (el) => el.hide(), "paystackPayButton hide");
  safeElementAction("#payfastPayButton", (el) => el.hide(), "payfastPayButton hide");
  safeElementAction("#statusText", (el) => el.text = "Checking your sign-up status...", "statusText update");

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
    safeElementAction("#goToDashboardButton", (el) => el.show(), "goToDashboardButton show");
    // Payment buttons hidden (sign-up already paid)
    safeElementAction("#statusText", (el) => el.text = `✅ Welcome back! Sign-up confirmed via ${status.signupSource}. Active ${status.membershipTier} membership.`, "statusText update");
  } 
  else if (status.hasSignUpPaid && !status.hasSubscription) {
    // ⚠️ SCENARIO 2: Sign up paid and confirmed BUT membership tier NOT selected/paid/confirmed
    // SHOW: goToSubscriptionButton ONLY
    sendDiscordLog(`⚠️ SCENARIO 2: User ${userId} (${email}) signup paid but needs subscription - showing subscription button`);
    safeElementAction("#goToSubscriptionButton", (el) => el.show(), "goToSubscriptionButton show");
    // Payment buttons hidden (sign-up already paid)
    if (status.hasMembershipTierSelected) {
      safeElementAction("#statusText", (el) => el.text = `✅ Sign-up confirmed (${status.signupSource}), but ${status.membershipTier} membership needs payment confirmation.`, "statusText update");
    } else {
      safeElementAction("#statusText", (el) => el.text = `✅ Sign-up confirmed (${status.signupSource}), but no membership tier selected yet.`, "statusText update");
    }
  } 
  else {
    // 📝 SCENARIO 3: Sign up fee NOT paid or cannot be confirmed
    // SHOW: openSignUp AND payment gateway buttons
    sendDiscordLog(`📝 SCENARIO 3: User ${userId} (${email}) needs signup payment - showing payment buttons (PayFast + Paystack)`);
    safeElementAction("#openSignUp", (el) => el.show(), "openSignUp show");
    safeElementAction("#paystackPayButton", (el) => el.show(), "paystackPayButton show");
    
    // PayFast button with enhanced logging
    const payfastShown = safeElementAction("#payfastPayButton", (el) => el.show(), "payfastPayButton show");
    if (payfastShown) {
      console.log("✅ PayFast button shown successfully");
      sendDiscordLog(`✅ PayFast button displayed for user ${userId} (${email}) - signup payment needed`);
    } else {
      console.error("❌ Cannot show payfastPayButton");
      sendDiscordLog(`❌ Failed to show PayFast button for user ${userId} (${email}) - element not found`);
    }
    
    safeElementAction("#statusText", (el) => el.text = "📝 Please complete your sign-up payment below using Paystack or PayFast.", "statusText update");
  }

  // --- Button Listeners (with robust element validation) ---
  
  // Helper function to safely attach event listeners
  function safeAttachClick(elementId, handler, description) {
    try {
      // First check if element exists in the $w collection
      const elements = $w(elementId);
      if (elements && elements.length > 0) {
        const element = elements[0];
        if (element && typeof element.onClick === 'function') {
          element.onClick(handler);
          console.log(`✅ ${description} onClick handler attached successfully`);
          return true;
        } else {
          console.log(`⚠️ ${description} exists but onClick method not available`);
          sendDiscordLog(`⚠️ ${description} exists but onClick method not available for user ${userId}`);
        }
      } else {
        console.log(`⚠️ ${description} element not found in DOM`);
        sendDiscordLog(`⚠️ ${description} element not found in DOM for user ${userId}`);
      }
    } catch (e) {
      console.error(`❌ ${description} attachment failed:`, e);
      sendDiscordLog(`❌ ${description} attachment failed for user ${userId}: ${e.message}`);
    }
    return false;
  }

  // Attach event listeners with validation
  safeAttachClick("#openSignUp", () => toggleForm(), "openSignUp button");
  
  safeAttachClick("#submitFormButton", () => handleFormSubmit(userId, email), "submitFormButton");
  
  safeAttachClick("#paystackPayButton", () => handlePaystackSignup(userId, email), "paystackPayButton");
  
  // PayFast button with enhanced logging
  const payfastAttached = safeAttachClick("#payfastPayButton", () => {
    console.log("🔥 PayFast button clicked! Initiating payment...");
    sendDiscordLog(`🔥 PayFast button clicked by user ${userId} (${email})`);
    handlePayfastSignup(userId, email);
  }, "payfastPayButton");
  
  if (payfastAttached) {
    sendDiscordLog(`✅ PayFast button initialized successfully for user ${userId} (${email})`);
  } else {
    sendDiscordLog(`❌ PayFast button initialization failed for user ${userId} (${email})`);
  }
  
  safeAttachClick("#goToDashboardButton", () => wixLocation.to("/dashboard"), "goToDashboardButton");
  
  safeAttachClick("#goToSubscriptionButton", () => wixLocation.to("/signup-success"), "goToSubscriptionButton");
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
    const statusUpdated = safeElementAction("#statusText", (el) => el.text = "🔗 Redirecting to PayFast...", "PayFast status text update");
    if (statusUpdated) {
      console.log("✅ Status text updated successfully");
    } else {
      console.error("❌ Failed to update status text");
      sendDiscordLog(`⚠️ PayFast: Failed to update status text for user ${userId} - element not found`);
    }
    
    console.log("🔗 Calling createPayfastPayment...");
    sendDiscordLog(`🔗 PayFast: About to call createPayfastPayment function for user ${userId} (${email})`);
    
    let url;
    try {
      sendDiscordLog(`🔧 PayFast: Executing createPayfastPayment(${userId}, ${email})`);
      url = await createPayfastPayment(userId, email);
      sendDiscordLog(`🎯 PayFast: createPayfastPayment returned: ${url}`);
    } catch (createError) {
      sendDiscordLog(`💥 PayFast: createPayfastPayment function threw error: ${createError.message}`);
      sendDiscordLog(`💥 PayFast: Error name: ${createError.name}`);
      sendDiscordLog(`💥 PayFast: Error stack: ${createError.stack}`);
      throw createError; // Re-throw to be caught by outer catch
    }
    
    if (!url) {
      throw new Error('PayFast payment URL is empty or undefined');
    }
    
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
    
    const errorStatusUpdated = safeElementAction("#statusText", (el) => el.text = "❌ Failed to initiate PayFast payment.", "PayFast error status update");
    if (!errorStatusUpdated) {
      console.error("❌ Also failed to update error status");
      sendDiscordLog(`❌ PayFast: Also failed to update error status for user ${userId} - element not found`);
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
