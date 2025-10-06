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

  // Add delay for element loading and retry mechanism
  async function auditWithRetry(retryCount = 0) {
    sendDiscordLog(`🔍 Element audit attempt ${retryCount + 1}/3...`);
    
    const elementAudit = auditPageElements();
    
    // If we found some elements but not all, and this is not the final retry
    if (elementAudit.missing.length > 0 && elementAudit.found.length > 0 && retryCount < 2) {
      sendDiscordLog(`⏳ Found ${elementAudit.found.length}/8 elements, retrying in 1 second...`);
      setTimeout(() => auditWithRetry(retryCount + 1), 1000);
      return elementAudit;
    }
    
    // Check if critical elements are still missing after retries
    if (elementAudit && elementAudit.missing.length === 8) {
      // ALL elements are missing - this might be a timing or selector issue
      sendDiscordLog(`🚨 TIMING ISSUE: User reports buttons exist but JavaScript cannot find them!`);
      sendDiscordLog(`🔧 POSSIBLE CAUSES: 1) Element IDs don't match 2) Timing issue 3) $w() selector problem`);
      sendDiscordLog(`📊 User sees: goToDashboardButton, goToSubscriptionButton, openSignUp, payfastPayButton, paystackPayButton`);
      sendDiscordLog(`🔍 JS Looking for: #goToDashboardButton, #goToSubscriptionButton, #openSignUp, #payfastPayButton, #paystackPayButton`);
      
      // Show a message to users if possible
      console.log("🚨 ELEMENT ACCESS ISSUE: Buttons exist but JavaScript cannot access them");
    } else if (elementAudit.missing.length > 0) {
      sendDiscordLog(`⚠️ PARTIAL SUCCESS: ${elementAudit.found.length}/8 elements found. Missing: ${elementAudit.missing.join(', ')}`);
    } else {
      sendDiscordLog(`✅ SUCCESS: All ${elementAudit.found.length} elements found and accessible!`);
    }
    
    return elementAudit;
  }
  
  // First audit what elements exist on the page with retry
  const elementAudit = await auditWithRetry();
  
  // Additional test: Try to directly access the buttons you mentioned
  sendDiscordLog(`🧪 DIRECT ACCESS TEST: Testing specific buttons you can see...`);
  
  const buttonsToTest = [
    'goToDashboardButton',
    'goToSubscriptionButton', 
    'openSignUp',
    'payfastPayButton',
    'paystackPayButton'
  ];
  
  buttonsToTest.forEach(buttonId => {
    try {
      // Test multiple selector variations
      const variations = [
        `#${buttonId}`,
        buttonId,
        `[id="${buttonId}"]`
      ];
      
      variations.forEach(selector => {
        try {
          const element = $w(selector);
          if (element && element.length > 0) {
            sendDiscordLog(`✅ DIRECT ACCESS SUCCESS: ${buttonId} found with selector "${selector}"`);
          } else {
            sendDiscordLog(`❌ DIRECT ACCESS FAIL: ${buttonId} not found with selector "${selector}"`);
          }
        } catch (e) {
          sendDiscordLog(`❌ DIRECT ACCESS ERROR: ${buttonId} with "${selector}" - ${e.message}`);
        }
      });
      
    } catch (e) {
      sendDiscordLog(`❌ DIRECT ACCESS EXCEPTION: ${buttonId} - ${e.message}`);
    }
  });
  
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
  
  // Helper function to safely manipulate elements with multiple selector attempts
  function safeElementAction(elementId, action, description) {
    // Try multiple selector variations
    const selectors = [
      elementId.startsWith('#') ? elementId : `#${elementId}`,
      elementId.startsWith('#') ? elementId.substring(1) : elementId
    ];
    
    for (const selector of selectors) {
      try {
        const elements = $w(selector);
        if (elements && elements.length > 0) {
          const element = elements[0];
          if (element) {
            action(element);
            console.log(`✅ ${description} action completed with selector "${selector}"`);
            sendDiscordLog(`✅ ${description} - SUCCESS with selector "${selector}"`);
            return true;
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
    
    console.log(`⚠️ ${description} element not found with any selector`);
    sendDiscordLog(`❌ ${description} - FAILED with selectors: ${selectors.join(', ')}`);
    return false;
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
  
  // Helper function to safely attach event listeners with multiple selector attempts  
  function safeAttachClick(elementId, handler, description) {
    // Try multiple selector variations
    const selectors = [
      elementId.startsWith('#') ? elementId : `#${elementId}`,
      elementId.startsWith('#') ? elementId.substring(1) : elementId
    ];
    
    for (const selector of selectors) {
      try {
        const elements = $w(selector);
        if (elements && elements.length > 0) {
          const element = elements[0];
          if (element && typeof element.onClick === 'function') {
            element.onClick(handler);
            console.log(`✅ ${description} onClick handler attached with selector "${selector}"`);
            sendDiscordLog(`✅ ${description} - onClick SUCCESS with selector "${selector}"`);
            return true;
          } else if (element) {
            console.log(`⚠️ ${description} found with "${selector}" but onClick method not available`);
            sendDiscordLog(`⚠️ ${description} found but onClick unavailable (type: ${element.type || 'unknown'})`);
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
    
    console.log(`❌ ${description} element not accessible with any selector`);
    sendDiscordLog(`❌ ${description} - onClick FAILED with selectors: ${selectors.join(', ')}`);
    return false;
  }

  // Helper function to create missing button elements programmatically
  function createMissingButton(buttonId, buttonText, containerSelector = 'body') {
    try {
      // Check if we can access the container
      const container = $w(containerSelector);
      if (!container || container.length === 0) {
        console.log(`⚠️ Cannot create ${buttonId}: container ${containerSelector} not found`);
        return false;
      }

      // Note: In Wix Velo, we typically can't create elements programmatically
      // The elements must exist in the Wix Editor
      sendDiscordLog(`⚠️ MISSING BUTTON: ${buttonId} (${buttonText}) must be added in Wix Editor. Cannot create programmatically.`);
      return false;
    } catch (e) {
      console.error(`❌ Error attempting to create ${buttonId}:`, e);
      sendDiscordLog(`❌ Error attempting to create ${buttonId}: ${e.message}`);
      return false;
    }
  }

  // Helper function to check what elements actually exist on the page
  function auditPageElements() {
    const requiredElements = [
      '#goToDashboardButton',
      '#goToSubscriptionButton', 
      '#openSignUp',
      '#paystackPayButton',
      '#payfastPayButton',
      '#formContainer',
      '#statusText',
      '#submitFormButton'
    ];
    
    const foundElements = [];
    const missingElements = [];
    
    // Debug: Let's also try without the # selector
    sendDiscordLog(`🔍 DEBUG: Starting element audit with ${requiredElements.length} required elements...`);
    
    requiredElements.forEach(elementId => {
      try {
        // Try with # selector first
        const elements = $w(elementId);
        if (elements && elements.length > 0) {
          foundElements.push(elementId);
          sendDiscordLog(`✅ FOUND: ${elementId} - element exists and accessible`);
        } else {
          // Try without # selector as fallback
          const elementIdNoHash = elementId.substring(1);
          try {
            const elementsNoHash = $w(`#${elementIdNoHash}`);
            if (elementsNoHash && elementsNoHash.length > 0) {
              foundElements.push(elementId);
              sendDiscordLog(`✅ FOUND (no-hash): ${elementId} - element exists with fallback selector`);
            } else {
              missingElements.push(elementId);
              sendDiscordLog(`❌ NOT FOUND: ${elementId} - element not accessible via $w()`);
            }
          } catch (e2) {
            missingElements.push(elementId);
            sendDiscordLog(`❌ ERROR: ${elementId} - ${e2.message}`);
          }
        }
      } catch (e) {
        missingElements.push(`${elementId} (error: ${e.message})`);
        sendDiscordLog(`❌ EXCEPTION: ${elementId} - ${e.message}`);
      }
    });
    
    sendDiscordLog(`🔍 Page Element Audit for user ${userId}:`);
    sendDiscordLog(`✅ Found elements (${foundElements.length}): ${foundElements.join(', ')}`);
    sendDiscordLog(`❌ Missing elements (${missingElements.length}): ${missingElements.join(', ')}`);
    
    if (missingElements.length > 0) {
      sendDiscordLog(`⚠️ CRITICAL: PayFast button functionality requires all elements to exist in HTML. Please add missing elements to the Sign-up page.`);
    }
    
    // Additional debugging - try alternative methods to detect elements
    sendDiscordLog(`🔬 DEEP DEBUG: Trying alternative element detection methods...`);
    
    // Try to get all elements on the page
    try {
      const allElements = $w('*');
      sendDiscordLog(`📊 Total elements found on page: ${allElements.length}`);
      
      // Try to find elements by checking if they have IDs that match what we need
      const buttonElements = allElements.filter(el => {
        try {
          return el.id && (
            el.id.includes('Button') || 
            el.id.includes('SignUp') || 
            el.id.includes('Container') || 
            el.id.includes('Text')
          );
        } catch (e) {
          return false;
        }
      });
      
      sendDiscordLog(`🎯 Elements with relevant IDs: ${buttonElements.length}`);
      buttonElements.forEach(el => {
        try {
          sendDiscordLog(`🔍 Found element with ID: ${el.id} (type: ${el.type || 'unknown'})`);
        } catch (e) {
          sendDiscordLog(`🔍 Found element but cannot read properties: ${e.message}`);
        }
      });
      
    } catch (e) {
      sendDiscordLog(`❌ Cannot enumerate all elements: ${e.message}`);
    }
    
    return { found: foundElements, missing: missingElements };
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

/* === Button Setup Logic === */

async function setupButtonVisibility() {
  try {
    sendDiscordLog(`🔍 Setting up button visibility for user ${userId || 'anonymous'}`);
    
    // Get the user's current payment status
    const paymentStatus = await getUserPaymentStatus(userId || 'anonymous');
    sendDiscordLog(`📊 Payment status for user ${userId}: ${JSON.stringify(paymentStatus)}`);

    // Track successful button setups
    let buttonsSetup = 0;
    let totalButtons = 0;

    if (paymentStatus.hasPaidForCurrentTier) {
      // Scenario 1: User has paid, show dashboard and subscription buttons
      sendDiscordLog(`✅ User ${userId} has paid - showing dashboard/subscription buttons`);
      
      totalButtons += 5;
      buttonsSetup += safeElementAction('#goToDashboardButton', (el) => el.show(), 'Show Dashboard Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#goToSubscriptionButton', (el) => el.show(), 'Show Subscription Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#openSignUp', (el) => el.hide(), 'Hide SignUp Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#paystackPayButton', (el) => el.hide(), 'Hide Paystack Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#payfastPayButton', (el) => el.hide(), 'Hide PayFast Button') ? 1 : 0;
      
      // Attach click handlers
      safeAttachClick('#goToDashboardButton', () => {
        wixLocationFrontend.to('/dashboard');
      }, 'Go to Dashboard Button');
      
      safeAttachClick('#goToSubscriptionButton', () => {
        wixLocationFrontend.to('/subscription-success');
      }, 'Go to Subscription Button');
      
    } else if (paymentStatus.hasSelectedTier) {
      // Scenario 2: User selected tier but hasn't paid, show payment buttons
      sendDiscordLog(`💰 User ${userId} selected tier but not paid - showing payment buttons`);
      
      totalButtons += 5;
      buttonsSetup += safeElementAction('#goToDashboardButton', (el) => el.hide(), 'Hide Dashboard Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#goToSubscriptionButton', (el) => el.hide(), 'Hide Subscription Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#openSignUp', (el) => el.hide(), 'Hide SignUp Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#paystackPayButton', (el) => el.show(), 'Show Paystack Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#payfastPayButton', (el) => el.show(), 'Show PayFast Button') ? 1 : 0;
      
      // Attach payment handlers
      safeAttachClick('#paystackPayButton', handlePaystackPayment, 'Paystack Pay Button');
      safeAttachClick('#payfastPayButton', handlePayfastPayment, 'PayFast Pay Button');
      
    } else {
      // Scenario 3: User hasn't selected tier, show signup button
      sendDiscordLog(`📝 User ${userId} hasn't selected tier - showing signup button`);
      
      totalButtons += 5;
      buttonsSetup += safeElementAction('#goToDashboardButton', (el) => el.hide(), 'Hide Dashboard Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#goToSubscriptionButton', (el) => el.hide(), 'Hide Subscription Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#openSignUp', (el) => el.show(), 'Show SignUp Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#paystackPayButton', (el) => el.hide(), 'Hide Paystack Button') ? 1 : 0;
      buttonsSetup += safeElementAction('#payfastPayButton', (el) => el.hide(), 'Hide PayFast Button') ? 1 : 0;
      
      // Attach signup handler
      safeAttachClick('#openSignUp', () => {
        // Show the signup form or navigate to signup
        safeElementAction('#formContainer', (el) => el.show(), 'Show Form Container');
      }, 'Open SignUp Button');
    }

    // Summary of button setup
    sendDiscordLog(`📊 Button setup summary: ${buttonsSetup}/${totalButtons} buttons successfully configured`);
    
    if (buttonsSetup === 0) {
      sendDiscordLog(`🚨 CRITICAL: No buttons could be configured! All required HTML elements are missing from the Sign-up page.`);
      sendDiscordLog(`🔧 SOLUTION NEEDED: Please add the required button elements in Wix Editor with IDs: goToDashboardButton, goToSubscriptionButton, openSignUp, paystackPayButton, payfastPayButton`);
    } else if (buttonsSetup < totalButtons) {
      sendDiscordLog(`⚠️ WARNING: Only ${buttonsSetup} out of ${totalButtons} buttons configured. Some functionality may not work.`);
    }

  } catch (error) {
    console.error("❌ Error setting up button visibility:", error);
    sendDiscordLog(`❌ Error setting up button visibility for user ${userId}: ${error.message}`);
  }
}

// Define payment handlers
async function handlePaystackPayment() {
  try {
    sendDiscordLog(`💳 Paystack payment initiated for user ${userId}`);
    // Get user email from form or user data
    const email = $w('#emailInput').value || wixUsers.currentUser.email;
    await handlePaystackSignup(userId, email);
  } catch (error) {
    console.error("❌ Paystack payment error:", error);
    sendDiscordLog(`❌ Paystack payment error for user ${userId}: ${error.message}`);
  }
}

async function handlePayfastPayment() {
  try {
    sendDiscordLog(`💳 PayFast payment initiated for user ${userId}`);
    // Get user email from form or user data
    const email = $w('#emailInput').value || wixUsers.currentUser.email;
    await handlePayfastSignup(userId, email);
  } catch (error) {
    console.error("❌ PayFast payment error:", error);
    sendDiscordLog(`❌ PayFast payment error for user ${userId}: ${error.message}`);
  }
}

/* === Utility === */
function formatDate(date) {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}
