// pages/Sign-up Success.js
import wixUsers from 'wix-users';
import wixData from 'wix-data';
import wixLocation from 'wix-location';
import wixWindow from 'wix-window';
import { ProfileService } from 'backend/core/profile-service.jsw';
import { PaymentService } from 'backend/core/payment-service.jsw';
import { createSubscriptionWithCustomer } from 'backend/paystackSubscriptionWithCustomer.jsw';
import { generatePayFastSubscriptionUrl } from 'backend/payfastUrl.jsw';

$w.onReady(async () => {
  const user = wixUsers.currentUser;
  const ref = wixLocation.query.reference || null;   // gateway reference (if present)
  const gateway = wixLocation.query.gateway || null; // "paystack" | "payfast" (if present)

  if (!user.loggedIn) {
    hideAll();
    $w('#confirmationText').text = '⚠️ Please log in to view your membership status.';
    $w('#confirmationText').show();
    return;
  }

  hideAll();

  try {
    const profile = await ProfileService.getOrCreateProfile(user.id);
    console.log('[Success] Profile:', {
      id: user.id,
      signUpPaid: profile.signUpPaid,
      subscriptionActive: profile.subscriptionActive,
      membershipTier: profile.membershipTier,
    });

    await handleUserState(user, profile, ref, gateway);
  } catch (err) {
    const errorId = `PAY-ERR-${Date.now()}`;
    console.error('[Success] Profile load error:', err);
    hideAll();
    $w('#confirmationText').text = `⚠️ Unable to load profile. Contact support. (Ref: ${errorId})`;
    $w('#confirmationText').show();
  }
});

function hideAll() {
  [
    '#confirmationText',
    '#billingCycleSwitch',
    '#switchLabel',
    '#planRepeater',
    '#dashboardLink',
    '#managePlanLink',
  ].forEach(id => { try { $w(id).hide(); } catch (_) {} });
  try {
    $w('#billingCycleSwitch').checked = false;
    $w('#switchLabel').text = 'Monthly';
  } catch (_) {}
}

async function handleUserState(user, profile, reference = null, provider = null) {
  const email = user.email;
  let signupPaymentConfirmed = false;

  // 1) Signup fee detection (Paystack + PayFast + redirect confirm)
  try {
    const det = await PaymentService.detectSignupPayment(user.id, email, reference, provider);
    signupPaymentConfirmed = !!(det.success && det.paymentDetected);
    if (signupPaymentConfirmed && !profile.signUpPaid) {
      await PaymentService.syncPaymentStatus(user.id, {
        signUpPaid: true,
        reference: det.reference,
        provider: det.provider
      });
      profile.signUpPaid = true;
    }
  } catch (e) {
    console.warn('[Success] Signup detection error, falling back to CMS:', e.message);
    signupPaymentConfirmed = !!profile.signUpPaid;
  }

  if (!signupPaymentConfirmed) {
    return showUnpaidState();
  }

  // 2) Subscription detection
  let subscriptionActive = false;
  let membershipTier = null;
  try {
    const sub = await PaymentService.detectActiveSubscription(user.id, email);
    if (sub.success && sub.hasActiveSubscription) {
      subscriptionActive = true;
      membershipTier = sub.planName;
      if (!profile.subscriptionActive || profile.membershipTier !== membershipTier) {
        await PaymentService.syncPaymentStatus(user.id, {
          subscriptionActive: true,
          membershipTier
        });
        profile.subscriptionActive = true;
        profile.membershipTier = membershipTier;
      }
    }
  } catch (e) {
    console.warn('[Success] Subscription detection error, falling back to CMS:', e.message);
    subscriptionActive = !!profile.subscriptionActive;
    membershipTier = profile.membershipTier || null;
  }

  // 3) UI states
  if (signupPaymentConfirmed && subscriptionActive && membershipTier && membershipTier !== 'Free') {
    return showSubscribedState(profile, user);
  }

  return showPlanSelection();
}

// --- STATE 1: Unpaid signup
function showUnpaidState() {
  hideAll();
  $w('#confirmationText').text = '⚠️ Signup payment required to access this page.';
  $w('#confirmationText').show();
  // keep user on page (they can use site menu/buttons) or redirect if you prefer:
  // wixLocation.to('/sign-up');
}

// --- STATE 2: Signup paid → choose plan
async function showPlanSelection() {
  hideAll();
  $w('#confirmationText').text = '✅ Signup complete! Please select a membership plan below.';
  $w('#confirmationText').show();

  $w('#billingCycleSwitch').show();
  $w('#switchLabel').show();

  const initialCycle = $w('#billingCycleSwitch').checked ? 'Annual' : 'Monthly';
  await loadPlansFromCMS(initialCycle);

  $w('#billingCycleSwitch').onChange(() => {
    const cycle = $w('#billingCycleSwitch').checked ? 'Annual' : 'Monthly';
    $w('#switchLabel').text = cycle;
    loadPlansFromCMS(cycle);
  });

  try { $w('#dashboardLink').hide(); } catch (_) {}
  try { $w('#managePlanLink').hide(); } catch (_) {}
}

// --- STATE 3: Subscribed (active)
async function showSubscribedState(profile, user) {
  hideAll();
  let planName = profile.membershipTier;

  try {
    const result = await import('backend/enhanced-subscription-detector.jsw')
      .then(m => m.detectUserSubscriptions(user.email, user.id));
    if (result.success && result.data?.selectedSubscription?.plan?.name) {
      planName = result.data.selectedSubscription.plan.name;
    }
  } catch (_) {}

  if (!planName || planName === 'undefined' || planName === 'null' || planName === 'N/A') {
    planName = 'Free';
  }

  $w('#confirmationText').html = `
    <p style="text-align:center;font-size:18px;color:#28a745;margin-bottom:20px;">
      🎉 <strong>Congratulations!</strong><br>
      You are subscribed to the <strong>${planName} Plan</strong>
    </p>
    <p style="text-align:center;font-size:16px;margin-bottom:30px;">
      Your emergency profile is now active and ready to use.
    </p>
  `;
  $w('#confirmationText').show();

  try {
    $w('#dashboardLink').label = 'Access Your Emergency Profile Dashboard';
    $w('#dashboardLink').show();
    $w('#dashboardLink').onClick(() => wixLocation.to('/emergency-profile-dashboard'));
  } catch {
    $w('#confirmationText').html += `
      <p style="text-align:center;">
        <a href="/emergency-profile-dashboard" style="background:#28a745;color:white;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;">
          Access Your Dashboard
        </a>
      </p>`;
  }

  try { $w('#managePlanLink').label = 'Manage Subscription'; $w('#managePlanLink').show(); } catch (_) {}

  try { $w('#billingCycleSwitch').hide(); $w('#switchLabel').hide(); $w('#planRepeater').hide(); } catch (_) {}
}

// --- Plans repeater
async function loadPlansFromCMS(cycle = 'Monthly') {
  try {
    const results = await wixData.query('PlanOptions').ascending('sortOrder').find();
    const planData = results.items;
    if (!planData.length) return;

    $w('#planRepeater').data = planData;
    $w('#planRepeater').show();

    $w('#planRepeater').onItemReady(($item, itemData) => {
      const price = cycle === 'Annual' ? itemData.annualPrice : itemData.monthlyPrice;
      $item('#planName').text = itemData.planTier;
      $item('#planDescription').text = itemData.description || '';
      $item('#planPrice').text = `R${price} / ${cycle}`;
      $item('#planImage').src = itemData.productImage;

      // Open payment selector lightbox (dual gateway)
      $item('#subscribeButton').label = `Choose Payment Method - ${itemData.planTier}`;
      $item('#subscribeButton').onClick(async () => {
        await wixWindow.openLightbox('SubscriptionPaymentSelector', {
          planName: itemData.planTier,
          amount: price,
          isAnnual: cycle === 'Annual',
          features: itemData.description ? itemData.description.split('\n').slice(0, 5) : [],
          savings: cycle === 'Annual' && itemData.monthlyPrice
            ? Math.round(((itemData.monthlyPrice * 12 - itemData.annualPrice) / (itemData.monthlyPrice * 12)) * 100)
            : 0
        });
      });
    });
  } catch (err) {
    console.error('❌ Plans load error:', err);
    $w('#confirmationText').text = '⚠️ Unable to load plans. Contact support.';
    $w('#confirmationText').show();
  }
}
