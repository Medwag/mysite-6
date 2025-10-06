// pages/Sign-up.js  (make sure this is the Sign-up page code, not Site or Success)
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import { createPaystackPayment } from 'backend/paystack.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';
import { getUserPaymentStatus } from 'backend/status.jsw';

const CANDIDATES = {
  signup:        ['#openSignUp', '#signup', '#btnSignUp', '#openSignup', '#openSignUpButton'],
  subscribe:     ['#goToSubscriptionButton', '#subscribe', '#btnSubscribe', '#goToPlans', '#choosePlanButton'],
  dashboard:     ['#goToDashboardButton', '#dashboard', '#btnDashboard', '#dashboardButton'],
  form:          ['#formContainerdata', '#formContainer01', '#formContainer', '#signupForm', '#signupFormContainer'],
  paystack:      ['#paystackPaymentButton', '#paystackPayButton', '#btnPaystack', '#paystack'],
  payfast:       ['#payfastPaymentButton', '#payfastPayButton', '#btnPayfast', '#payfast'],
  status:        ['#membersStatus', '#statusText', '#status', '#statusLabel']
};

/* ---------- tiny helpers ---------- */
const tryGet = (sel) => {
  try { const el = $w(sel); /* will throw if not found */ el.id; return el; } catch { return null; }
};
const pick = (list) => {
  for (const s of list) { const el = tryGet(s); if (el) return { el, sel: s }; }
  return { el: null, sel: null };
};
const safeShow = (el) => { try { el.show(); } catch {} };
const safeHide = (el) => { try { el.hide(); } catch {} };
const safeText = (el, t) => { try { el.text = t; } catch {} };
const safeCollapse = (el) => { try { el.collapse(); } catch {} };
const safeExpandSlideLeft = async (el) => {
  try {
    // expand + slide-in if supported
    if (el.collapsed) await el.expand();
    await el.show('slide', { direction: 'left', duration: 400 });
  } catch {
    try { await el.show(); } catch {}
  }
};

/* ---------- main ---------- */
$w.onReady(async () => {
  console.log('🔎 Sign-up page booting… resolving elements…');

  // Resolve all targets from candidate IDs (works even if you changed names in Editor)
  const UI = {
    signup:    pick(CANDIDATES.signup),
    subscribe: pick(CANDIDATES.subscribe),
    dashboard: pick(CANDIDATES.dashboard),
    form:      pick(CANDIDATES.form),
    paystack:  pick(CANDIDATES.paystack),
    payfast:   pick(CANDIDATES.payfast),
    status:    pick(CANDIDATES.status)
  };

  // Debug: print what we found / missed
  Object.entries(UI).forEach(([k, v]) => {
    console.log(v.el
      ? `✅ resolved ${k} → ${v.sel}`
      : `❌ missing ${k} → tried: ${CANDIDATES[k].join(', ')}`);
  });

  // If literally everything is missing, the code is not attached to THIS page
  const resolvedCount = Object.values(UI).filter(x => !!x.el).length;
  if (resolvedCount === 0) {
    console.error('🚨 No elements resolved. This code is likely not attached to the Sign-up page or the page has no elements (wrong page).');
    return;
  }

  // Start with a clean slate
  [UI.signup.el, UI.subscribe.el, UI.dashboard.el].forEach(el => el && safeHide(el));
  UI.form.el && safeCollapse(UI.form.el);
  UI.status.el && safeText(UI.status.el, 'Checking your membership status…');

  const user = wixUsers.currentUser;
  if (!user.loggedIn) {
    UI.status.el && safeText(UI.status.el, '⚠️ Please log in to continue.');
    return;
  }

  // Fetch status (signup payment + subscription)
  let email = '';
  try { email = await user.getEmail(); } catch {}
  let status;
  try {
    status = await getUserPaymentStatus(user.id, email);
    console.log('📊 status:', status);
  } catch (e) {
    console.error('❌ getUserPaymentStatus failed:', e);
    UI.status.el && safeText(UI.status.el, '❌ Could not check your status. Please refresh and try again.');
    return;
  }

  // =========================
  //  Visibility rules (exact)
  // =========================
  //  dashboard: show only when signup paid AND subscription active
  //  subscribe: show only when signup paid AND subscription NOT active
  //  signup   : show only when signup NOT paid AND no plan selected
  const hasSignup   = !!status?.hasSignUpPaid;
  const hasSub      = !!status?.hasSubscription;
  const hasPlanSel  = !!status?.hasMembershipTierSelected;

  if (!hasSignup && !hasPlanSel) {
    // Need to pay signup first
    UI.signup.el    && safeShow(UI.signup.el);
    UI.subscribe.el && safeHide(UI.subscribe.el);
    UI.dashboard.el && safeHide(UI.dashboard.el);
    UI.status.el    && safeText(UI.status.el, 'Please complete your sign-up payment to continue.');
  } else if (hasSignup && !hasSub) {
    // Signup paid → choose plan
    UI.signup.el    && safeHide(UI.signup.el);
    UI.subscribe.el && safeShow(UI.subscribe.el);
    UI.dashboard.el && safeHide(UI.dashboard.el);
    UI.status.el    && safeText(UI.status.el, 'Signup confirmed ✅ Choose your membership plan to activate.');
  } else if (hasSignup && hasSub) {
    // Fully onboarded
    UI.signup.el    && safeHide(UI.signup.el);
    UI.subscribe.el && safeHide(UI.subscribe.el);
    UI.dashboard.el && safeShow(UI.dashboard.el);
    UI.status.el    && safeText(UI.status.el, 'Welcome back! Your subscription is active.');
  } else {
    // Fallback (be conservative → show signup)
    UI.signup.el    && safeShow(UI.signup.el);
    UI.subscribe.el && safeHide(UI.subscribe.el);
    UI.dashboard.el && safeHide(UI.dashboard.el);
    UI.status.el    && safeText(UI.status.el, 'Please complete your sign-up payment to continue.');
  }

  // =========================
  //  Interactions
  // =========================
  // Signup button → slide form in from left
  if (UI.signup.el) {
    UI.signup.el.onClick(() => UI.form.el && safeExpandSlideLeft(UI.form.el));
  }

  // Paystack / PayFast (inside form)
  if (UI.paystack.el) {
    UI.paystack.el.onClick(async () => {
      try {
        UI.status.el && safeText(UI.status.el, 'Redirecting to Paystack…');
        const url = await createPaystackPayment(user.id, email);
        wixLocation.to(url);
      } catch (e) {
        console.error('❌ Paystack error:', e);
        UI.status.el && safeText(UI.status.el, '❌ Failed to start Paystack payment. Please try again.');
      }
    });
  }

  if (UI.payfast.el) {
    UI.payfast.el.onClick(async () => {
      try {
        UI.status.el && safeText(UI.status.el, 'Redirecting to PayFast…');
        const url = await createPayfastPayment(user.id, email);
        wixLocation.to(url);
      } catch (e) {
        console.error('❌ PayFast error:', e);
        UI.status.el && safeText(UI.status.el, '❌ Failed to start PayFast payment. Please try again.');
      }
    });
  }

  // Subscribe & Dashboard navigation
  if (UI.subscribe.el) UI.subscribe.el.onClick(() => wixLocation.to('/subscription'));
  if (UI.dashboard.el) UI.dashboard.el.onClick(() => wixLocation.to('/dashboard'));

  // Final snapshot in logs
  console.log('🎛 UI state →', {
    signupVisible:    !!UI.signup.el && UI.signup.el.visible,
    subscribeVisible: !!UI.subscribe.el && UI.subscribe.el.visible,
    dashboardVisible: !!UI.dashboard.el && UI.dashboard.el.visible,
    formResolved:     !!UI.form.el,
    paystackResolved: !!UI.paystack.el,
    payfastResolved:  !!UI.payfast.el
  });
});
