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
    
    // Cache elements
    const paystackBtn = $w('#paystackPayButton');
    const payfastBtn = $w('#payfastPayButton');
    const openSignUp = $w('#openSignUp');
    const goSubBtn = $w('#goToSubscriptionButton');
    const goDashBtn = $w('#goToDashboardButton');
    const statusText = $w('#statusText');
    const formContainer = $w('#formContainer');

    // Initial state
    paystackBtn.hide();
    payfastBtn.hide();
    goSubBtn.hide();
    goDashBtn.hide();
    formContainer.hide();
    statusText.text = "Checking your signup status...";

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
            statusText.text = "✅ Signup payment already completed! Redirecting...";
            setTimeout(() => wixLocation.to("/subscription"), 1500);
            return;
        }

        // Step 2: Show open sign-up CTA
        statusText.text = "Welcome! Click below to begin your signup.";
        openSignUp.show();

        // Step 3: Animate open signup container
        openSignUp.onClick(() => {
            openSignUp.hide("fade", { duration: 200 });
            formContainer.show("slide", { direction: "left", duration: 500 });
            statusText.text = "Please choose your payment method below:";
            paystackBtn.show("fade");
            payfastBtn.show("fade");
        });

        // Step 4: PAYSTACK PAYMENT FLOW
        paystackBtn.onClick(async () => {
            try {
                statusText.text = "🔄 Creating Paystack payment link...";
                const paystackUrl = await createSignupPaymentUrl(userId, email);
                if (paystackUrl) {
                    statusText.text = "Redirecting to Paystack for secure payment...";
                    wixLocation.to(paystackUrl);
                } else {
                    throw new Error("Paystack payment URL not generated.");
                }
            } catch (err) {
                console.error("❌ Paystack payment failed:", err);
                statusText.text = `⚠️ Paystack error: ${err.message}`;
            }
        });

        // Step 5: PAYFAST PAYMENT FLOW
        payfastBtn.onClick(async () => {
            try {
                statusText.text = "🔄 Creating PayFast payment link...";
                const payfastUrl = await createPayfastPayment(userId, email);
                if (payfastUrl) {
                    statusText.text = "Redirecting to PayFast for secure payment...";
                    wixLocation.to(payfastUrl);
                } else {
                    throw new Error("PayFast payment URL not generated.");
                }
            } catch (err) {
                console.error("❌ PayFast payment failed:", err);
                statusText.text = `⚠️ PayFast error: ${err.message}`;
            }
        });

        // Step 6: HANDLE RETURN FROM PAYMENT GATEWAYS
        const query = wixLocation.query;
        if (query.reference || query.trxref || query.payment_id) {
            const reference = query.reference || query.trxref || query.payment_id;
            const provider = query.gateway || (query.reference ? "paystack" : "payfast");
            statusText.text = `🔍 Verifying your ${provider} payment...`;

            const verify = await detectSignupPayment(userId, email, reference, provider);
            if (verify.success && verify.paymentDetected) {
                statusText.text = "🎉 Payment confirmed! Setting up your account...";
                await sendPostPaymentNotifications(userId, verify.reference);
                setTimeout(() => wixLocation.to("/subscription"), 2000);
            } else {
                statusText.text = "⚠️ Payment not confirmed yet. Please contact support if already paid.";
                paystackBtn.show();
                payfastBtn.show();
            }
        }

    } catch (error) {
        console.error("❌ Signup page error:", error);
        $w('#statusText').text = `An error occurred: ${error.message}`;
    }
});
