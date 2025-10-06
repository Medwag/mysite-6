// Sign-up Page - Clean Implementation Based on Exact Requirements
import wixLocation from 'wix-location';
import wixUsers from 'wix-users';
import { getUserPaymentStatus } from 'backend/status.jsw';
import { detectSignupPayment } from 'backend/core/payment-service.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';
import { createSignupPaymentUrl } from 'backend/paystackUrl.jsw';
import { sendPostPaymentNotifications } from 'backend/profile-utils.jsw';

// EXACT ELEMENT NAMES AS SPECIFIED:
// dashboard - Navigation button (paid + subscription selected)
// subscribe - Navigation button (paid signup, needs plan selection) 
// signup - Action button (no signup payment, no subscription)
// formContainerdata - Animated container with payment buttons
// payfastPaymentButton - PayFast payment option
// paystackPaymentButton - Paystack payment option
// MembersStatus - Status text at top of page

$w.onReady(async function () {
    console.log("🚀 Sign-up Page Loaded - Using Exact Element Names");
    
    // Get elements using EXACT names provided by user
    function getElementSafely(elementId, description) {
        const selectors = [`#${elementId}`, elementId];
        
        for (const selector of selectors) {
            try {
                const element = $w(selector);
                if (element && element.length > 0) {
                    console.log(`✅ Found ${description}: "${selector}"`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }
        console.log(`❌ Could not find ${description} (${elementId})`);
        return null;
    }
    
    // Cache elements using EXACT names you specified
    const dashboardBtn = getElementSafely('dashboard', 'Dashboard Button');
    const subscribeBtn = getElementSafely('subscribe', 'Subscribe Button'); 
    const signupBtn = getElementSafely('signup', 'Signup Button');
    const formContainer = getElementSafely('formContainerdata', 'Form Container');
    const payfastBtn = getElementSafely('payfastPaymentButton', 'PayFast Payment Button');
    const paystackBtn = getElementSafely('paystackPaymentButton', 'Paystack Payment Button');
    const statusText = getElementSafely('MembersStatus', 'Members Status Text');
    
    // Try multiple selector approaches for each element
    function getElement(selectors, elementName) {
        for (const selector of selectors) {
            try {
                const element = $w(selector);
                if (element && element.length > 0) {
                    console.log(`✅ Found ${elementName} with selector: ${selector}`);
                    return element;
                }
            } catch (e) {
                continue;
            }
        }
        console.log(`❌ Could not find ${elementName} with any selector`);
        return null;
    }
    
    // STEP 3: DIRECT ELEMENT ACCESS TEST
    console.log("\n🧪 TESTING DIRECT ACCESS TO SPECIFIC ELEMENTS:");
    const directTests = [
        'paystackPayButton',
        'payfastPayButton', 
        'openSignUp',
        'goToDashboardButton',
        'goToSubscriptionButton',
        'statusText',
        'formContainer',
        'formContainer01',
        'box61'
    ];
    
    directTests.forEach(elementId => {
        console.log(`\n🔍 Testing "${elementId}":`);
        const testSelectors = [
            `#${elementId}`,
            elementId,
            `[id="${elementId}"]`,
            `[id*="${elementId}"]`
        ];
        
        testSelectors.forEach(selector => {
            try {
                const result = $w(selector);
                if (result && result.length > 0) {
                    console.log(`   ✅ SUCCESS: "${selector}" found ${result.length} element(s)`);
                    try {
                        console.log(`      - Type: ${result.type || result[0].type || 'unknown'}`);
                        console.log(`      - ID: ${result.id || result[0].id || 'unknown'}`);
                    } catch (propError) {
                        console.log(`      - Properties not readable: ${propError.message}`);
                    }
                } else {
                    console.log(`   ❌ FAIL: "${selector}" returned empty/null`);
                }
            } catch (e) {
                console.log(`   💥 ERROR: "${selector}" threw: ${e.message}`);
            }
        });
    });

    // Get elements using multiple selector attempts
    paystackBtn = getElement(['#paystackPayButton', '#formContainer01 #paystackPayButton', 'paystackPayButton'], 'paystackPayButton');
    payfastBtn = getElement(['#payfastPayButton', '#formContainer01 #payfastPayButton', 'payfastPayButton'], 'payfastPayButton');
    openSignUp = getElement(['#openSignUp', '#box61 #openSignUp', 'openSignUp'], 'openSignUp');
    goSubBtn = getElement(['#goToSubscriptionButton', '#box61 #goToSubscriptionButton', 'goToSubscriptionButton'], 'goToSubscriptionButton');
    goDashBtn = getElement(['#goToDashboardButton', '#box61 #goToDashboardButton', 'goToDashboardButton'], 'goToDashboardButton');
    statusText = getElement(['#statusText', 'statusText'], 'statusText');
    formContainer = getElement(['#formContainer01', '#formContainer', 'formContainer01', 'formContainer'], 'formContainer');

    // Initialize page - hide all buttons initially  
    console.log("\n🎛️ Initializing page elements...");
    if (dashboardBtn) dashboardBtn.hide();
    if (subscribeBtn) subscribeBtn.hide();
    if (signupBtn) signupBtn.hide();
    if (formContainer) formContainer.hide();
    if (statusText) statusText.text = "🔍 Checking your signup status...";

    try {
        // Get user information
        const user = wixUsers.currentUser;
        if (!user.loggedIn) {
            if (statusText) statusText.text = "⚠️ Please log in to continue.";
            return;
        }

        const userId = user.id;
        const email = user.getEmail ? await user.getEmail() : null;
        console.log(`👤 User loaded: ${email} (${userId})`);

        // Get user's payment and subscription status
        const status = await getUserPaymentStatus(userId, email);
        console.log("� User status:", status);

        // BUSINESS LOGIC IMPLEMENTATION
        // Based on your exact requirements:
        
        if (status.hasSignUpPaid && status.hasSubscription) {
            // SCENARIO 1: Sign up paid AND subscription selected/paid
            // SHOW: dashboard button only
            console.log("✅ SCENARIO 1: User has paid signup + has subscription → Show DASHBOARD");
            if (statusText) statusText.text = `✅ Welcome back! You're all set with your ${status.membershipTier || 'premium'} membership.`;
            if (dashboardBtn) dashboardBtn.show();
            
        } else if (status.hasSignUpPaid && !status.hasSubscription) {
            // SCENARIO 2: Sign up paid but NO subscription selected
            // SHOW: subscribe button only  
            console.log("⚠️ SCENARIO 2: User paid signup but needs subscription → Show SUBSCRIBE");
            if (statusText) statusText.text = "✅ Signup payment confirmed! Please select your membership plan.";
            if (subscribeBtn) subscribeBtn.show();
            
        } else {
            // SCENARIO 3: NO signup payment confirmed
            // SHOW: signup button only
            console.log("📝 SCENARIO 3: User needs to pay signup fee → Show SIGNUP");
            if (statusText) statusText.text = "👋 Welcome! Please complete your signup payment to get started.";
            if (signupBtn) signupBtn.show();
        }

        // BUTTON CLICK HANDLERS
        
        // DASHBOARD BUTTON: Navigate to dashboard  
        if (dashboardBtn) {
            dashboardBtn.onClick(() => {
                console.log("🎯 Dashboard button clicked");
                if (statusText) statusText.text = "Redirecting to your dashboard...";
                wixLocation.to("/dashboard");
            });
        }
        
        // SUBSCRIBE BUTTON: Navigate to subscription plans
        if (subscribeBtn) {
            subscribeBtn.onClick(() => {
                console.log("🎯 Subscribe button clicked");  
                if (statusText) statusText.text = "Redirecting to membership plans...";
                wixLocation.to("/subscription"); // or wherever your plans are
            });
        }
        
        // SIGNUP BUTTON: Animate form container and show payment options
        if (signupBtn) {
            signupBtn.onClick(() => {
                console.log("🎯 Signup button clicked - showing payment options");
                
                // Hide signup button and animate form container
                if (signupBtn) signupBtn.hide("fade", { duration: 200 });
                if (formContainer) formContainer.show("slide", { direction: "left", duration: 500 });
                if (statusText) statusText.text = "💳 Please choose your payment method:";
                
                // Show payment buttons inside the container
                if (payfastBtn) payfastBtn.show("fade");
                if (paystackBtn) paystackBtn.show("fade");
            });
        }

        // PAYSTACK PAYMENT BUTTON: Initiate Paystack signup payment
        if (paystackBtn) {
            paystackBtn.onClick(async () => {
                try {
                    console.log("💳 Paystack payment button clicked");
                    if (statusText) statusText.text = "🔄 Creating Paystack payment link...";
                    
                    const paystackUrl = await createSignupPaymentUrl(userId, email);
                    if (paystackUrl) {
                        if (statusText) statusText.text = "🔗 Redirecting to Paystack for secure payment...";
                        setTimeout(() => wixLocation.to(paystackUrl), 500);
                    } else {
                        throw new Error("Paystack payment URL not generated.");
                    }
                } catch (err) {
                    console.error("❌ Paystack payment failed:", err);
                    if (statusText) statusText.text = `⚠️ Paystack error: ${err.message}`;
                }
            });
            console.log("✅ Paystack payment button initialized");
        } else {
            console.log("❌ Cannot attach onClick to paystackPaymentButton - element not found");
        }

        // PAYFAST PAYMENT BUTTON: Initiate PayFast signup payment  
        if (payfastBtn) {
            payfastBtn.onClick(async () => {
                try {
                    console.log("💳 PayFast payment button clicked");
                    if (statusText) statusText.text = "🔄 Creating PayFast payment link...";
                    
                    const payfastUrl = await createPayfastPayment(userId, email);
                    if (payfastUrl) {
                        if (statusText) statusText.text = "🔗 Redirecting to PayFast for secure payment...";
                        setTimeout(() => wixLocation.to(payfastUrl), 500);
                    } else {
                        throw new Error("PayFast payment URL not generated.");
                    }
                } catch (err) {
                    console.error("❌ PayFast payment failed:", err);
                    if (statusText) statusText.text = `⚠️ PayFast error: ${err.message}`;
                }
            });
            console.log("✅ PayFast payment button initialized");
        } else {
            console.log("❌ Cannot attach onClick to payfastPaymentButton - element not found");
        }

        // Step 6: HANDLE RETURN FROM PAYMENT GATEWAYS
        const query = wixLocation.query;
        if (query.reference || query.trxref || query.payment_id) {
            const reference = query.reference || query.trxref || query.payment_id;
            const provider = query.gateway || (query.reference ? "paystack" : "payfast");
            statusText.text = `🔍 Verifying your ${provider} payment...`;

            const verify = await detectSignupPayment(userId, email, reference, provider);
            if (verify.success && verify.paymentDetected) {
                if (statusText) statusText.text = "🎉 Payment confirmed! Setting up your account...";
                await sendPostPaymentNotifications(userId, verify.reference);
                setTimeout(() => wixLocation.to("/subscription"), 2000);
            } else {
                if (statusText) statusText.text = "⚠️ Payment not confirmed yet. Please contact support if already paid.";
                if (paystackBtn) paystackBtn.show();
                if (payfastBtn) payfastBtn.show();
            }
        }

    } catch (error) {
        console.error("❌ Signup page error:", error);
        
        // Try to show error in ANY text element we can find
        try {
            const allTextElements = $w('*').filter(el => {
                try {
                    return el.type === 'text' || (el.text !== undefined);
                } catch (e) {
                    return false;
                }
            });
            
            if (allTextElements.length > 0) {
                allTextElements[0].text = `❌ ERROR: ${error.message}`;
                console.log(`✅ Error shown in text element: ${allTextElements[0].id || 'unknown ID'}`);
            } else {
                console.log("❌ No text elements found to show error");
            }
        } catch (e) {
            console.log("❌ Could not display error:", e.message);
        }
    }
    
    // FINAL ELEMENT REPORT SUMMARY
    console.log("\n" + "=".repeat(60));
    console.log("📋 FINAL ELEMENT ACCESS SUMMARY");
    console.log("=".repeat(60));
    console.log(`openSignUp: ${openSignUp ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`paystackBtn: ${paystackBtn ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`payfastBtn: ${payfastBtn ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`goSubBtn: ${goSubBtn ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`goDashBtn: ${goDashBtn ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`statusText: ${statusText ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`formContainer: ${formContainer ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log("=".repeat(60));
});
