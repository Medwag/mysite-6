// src/pages/signup.js
import wixLocation from 'wix-location';
import wixUsers from 'wix-users';
import { getUserPaymentStatus } from 'backend/status.jsw';
import { detectSignupPayment } from 'backend/core/payment-service.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';
import { createSignupPaymentUrl } from 'backend/paystackUrl.jsw';
import { sendPostPaymentNotifications } from 'backend/profile-utils.jsw';

$w.onReady(async function () {
    console.log("🚀 Sign-up Page Loaded");
    
    // Cache elements with container-aware access
    // Based on user report: openSignUp and dashboard buttons are in box61
    // Payment buttons are in formContainer01
    
    let paystackBtn, payfastBtn, openSignUp, goSubBtn, goDashBtn, statusText, formContainer;
    
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
    
    // Get elements using multiple selector attempts
    paystackBtn = getElement(['#paystackPayButton', '#formContainer01 #paystackPayButton', 'paystackPayButton'], 'paystackPayButton');
    payfastBtn = getElement(['#payfastPayButton', '#formContainer01 #payfastPayButton', 'payfastPayButton'], 'payfastPayButton');
    openSignUp = getElement(['#openSignUp', '#box61 #openSignUp', 'openSignUp'], 'openSignUp');
    goSubBtn = getElement(['#goToSubscriptionButton', '#box61 #goToSubscriptionButton', 'goToSubscriptionButton'], 'goToSubscriptionButton');
    goDashBtn = getElement(['#goToDashboardButton', '#box61 #goToDashboardButton', 'goToDashboardButton'], 'goToDashboardButton');
    statusText = getElement(['#statusText', 'statusText'], 'statusText');
    formContainer = getElement(['#formContainer01', '#formContainer', 'formContainer01', 'formContainer'], 'formContainer');

    // Initial state - with safety checks
    if (paystackBtn) paystackBtn.hide();
    if (payfastBtn) payfastBtn.hide();
    if (goSubBtn) goSubBtn.hide();
    if (goDashBtn) goDashBtn.hide();
    if (formContainer) formContainer.hide();
    if (statusText) statusText.text = "Checking your signup status...";

    try {
        const user = wixUsers.currentUser;
        if (!user.loggedIn) {
            statusText.text = "Please log in or sign up to continue.";
            return;
        }

        const userId = user.id;
        const email = user.getEmail ? await user.getEmail() : null;

        console.log(`🧠 Loaded user: ${email} (${userId})`);

        // Step 1: Check if user already paid
        const status = await getUserPaymentStatus(userId, email);
        console.log("💰 Payment status:", status);

        if (status.hasSignUpPaid) {
            if (statusText) statusText.text = "✅ Signup payment already completed! Redirecting...";
            setTimeout(() => wixLocation.to("/subscription"), 1500);
            return;
        }

        // Step 2: Show open sign-up CTA
        if (statusText) statusText.text = "Welcome! Click below to begin your signup.";
        if (openSignUp) {
            openSignUp.show();
        } else {
            console.log("❌ openSignUp element not found - cannot show signup button");
            if (statusText) statusText.text = "⚠️ Page setup issue - please contact support";
        }

        // Step 3: Animate open signup container
        if (openSignUp) {
            openSignUp.onClick(() => {
                if (openSignUp) openSignUp.hide("fade", { duration: 200 });
                if (formContainer) formContainer.show("slide", { direction: "left", duration: 500 });
                if (statusText) statusText.text = "Please choose your payment method below:";
                if (paystackBtn) paystackBtn.show("fade");
                if (payfastBtn) payfastBtn.show("fade");
            });
        } else {
            console.log("❌ Cannot attach onClick to openSignUp - element not found");
        }

        // Step 4: PAYSTACK PAYMENT FLOW
        if (paystackBtn) {
            paystackBtn.onClick(async () => {
                try {
                    if (statusText) statusText.text = "🔄 Creating Paystack payment link...";
                    const paystackUrl = await createSignupPaymentUrl(userId, email);
                    if (paystackUrl) {
                        if (statusText) statusText.text = "Redirecting to Paystack for secure payment...";
                        wixLocation.to(paystackUrl);
                    } else {
                        throw new Error("Paystack payment URL not generated.");
                    }
                } catch (err) {
                    console.error("❌ Paystack payment failed:", err);
                    if (statusText) statusText.text = `⚠️ Paystack error: ${err.message}`;
                }
            });
        } else {
            console.log("❌ Cannot attach onClick to paystackBtn - element not found");
        }

        // Step 5: PAYFAST PAYMENT FLOW
        if (payfastBtn) {
            payfastBtn.onClick(async () => {
                try {
                    if (statusText) statusText.text = "🔄 Creating PayFast payment link...";
                    const payfastUrl = await createPayfastPayment(userId, email);
                    if (payfastUrl) {
                        if (statusText) statusText.text = "Redirecting to PayFast for secure payment...";
                        wixLocation.to(payfastUrl);
                    } else {
                        throw new Error("PayFast payment URL not generated.");
                    }
                } catch (err) {
                    console.error("❌ PayFast payment failed:", err);
                    if (statusText) statusText.text = `⚠️ PayFast error: ${err.message}`;
                }
            });
        } else {
            console.log("❌ Cannot attach onClick to payfastBtn - element not found");
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
        $w('#statusText').text = `An error occurred: ${error.message}`;
    }
});
