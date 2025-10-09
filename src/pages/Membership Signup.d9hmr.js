// membersignup page logic (clean implementation)
import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import wixData from 'wix-data';

import { getUserPaymentStatus } from 'backend/status.jsw';
import { detectSignupPayment } from 'backend/core/payment-service.jsw';
import { getEmergencyProfile, updateEmergencyProfile } from 'backend/core/profile-service.jsw';
import { setSignupPaid } from 'backend/core/signup-utils.jsw';
import { logMembershipSignupAudit } from 'backend/membership-signup-audit.jsw';
import { createPaystackPayment } from 'backend/paystack.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';

// Helpers
const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};
const money = (n) => `R ${Number(n || 0).toFixed(2)}`;
const dateStr = (d) => { try { return new Date(d).toLocaleDateString(); } catch { return ''; } };
const show = (el) => { try { el.show(); } catch(_){} };
const hide = (el) => { try { el.hide(); } catch(_){} };
const setText = (el, t) => { try { el.text = String(t); } catch(_){} };
const setLabel = (el, t) => { try { el.label = String(t); } catch(_) { setText(el, t); } };
const setEnabled = (el, enabled) => { try { el.enabled = !!enabled; } catch(_){} };
const onClick = (el, fn) => { try { el.onClick(fn); } catch(_){} };
const expandOrShow = async (el) => {
  try { if (el.expand) { await el.expand(); } else { await el.show(); } } catch { try { await el.show(); } catch(_){} }
};

// Robust element resolution (borrowed pattern from Sign-up page)
const tryGet = (sel) => { try { const el = $w(sel); el.id; return el; } catch { return null; } };
const safeQueryAll = (_type='*') => { try { return $w('*') || []; } catch { return []; } };
const getKey = (el) => { try { return el.id || null; } catch { return null; } };
const pick = (candidates = [], finder, used) => {
  for (const s of candidates) { const el = tryGet(s); if (el) { const k = getKey(el); if (k) used && used.add(k); return { el, sel: s }; } }
  if (typeof finder === 'function') {
    const r = finder(); if (r && r.el) { const k = getKey(r.el); if (k) used && used.add(k); return r; }
  }
  return { el: null, sel: null };
};
const findByText = (types = [], hints = [], used) => {
  if (!types.length || !hints.length) return null;
  const loweredHints = hints.map(h => h.toLowerCase());
  for (const type of types) {
    const list = safeQueryAll(type);
    for (const el of list) {
      if (!el) continue; const key = getKey(el); if (key && used.has(key)) continue;
      const label = [el.label, el.text, el.placeholder].filter(Boolean).join(' ').toLowerCase();
      if (!label) continue; if (loweredHints.some(h => label.includes(h))) { return { el, sel: `resolved:${hints[0]}`, via: 'text' }; }
    }
  }
  return null;
};
const findByIdSubstring = (hints = [], used) => {
  if (!hints.length) return null; const lowered = hints.map(h => h.toLowerCase()); const loweredTight = hints.map(h => h.toLowerCase().replace(/\s+/g, ''));
  const all = safeQueryAll('*');
  for (const el of all) {
    if (!el) continue; const key = getKey(el); if (key && used.has(key)) continue;
    const id = (el.id || '').toLowerCase(); if (!id) continue; const tight = id.replace(/\s+/g, '');
    if (lowered.some(h => id.includes(h)) || loweredTight.some(h => tight.includes(h))) { return { el, sel: `#${el.id}`, via: 'id-partial' }; }
  }
  return null;
};

async function openSignup(userId, email) {
  // Prefer the payment method selector; fall back to direct gateway start; then legacy lightboxes
  try {
    await wixWindow.openLightbox('PaymentMethodSelector', { userId, email });
    return;
  } catch (e) {
    console.warn('PaymentMethodSelector lightbox not available:', e?.message);
  }
  // Direct payment fallback: try Paystack then PayFast
  try {
    const url = await createPaystackPayment(userId, email);
    if (url) { wixLocation.to(url); return; }
  } catch (e) { console.warn('Paystack fallback failed:', e?.message); }
  try {
    const url2 = await createPayfastPayment(userId, email);
    if (url2) { wixLocation.to(url2); return; }
  } catch (e) { console.warn('PayFast fallback failed:', e?.message); }
  // Legacy content lightboxes as last resort (non-payment)
  try { await wixWindow.openLightbox('CollectAddresses'); return; } catch (_) {}
  try { await wixWindow.openLightbox('CollectAddresses1'); return; } catch (_) {}
}

async function ensureCmsSignup(userId, detection) {
  if (!detection?.paymentDetected) return;
  const opts = {
    reference: detection.reference,
    gateway: detection.provider,
    amount: detection.amount,
    date: detection.paymentDate ? new Date(detection.paymentDate) : new Date()
  };
  try {
    await setSignupPaid(userId, opts);
  } catch(_) {
    // Fallback direct update
    const updates = {
      signUpPaid: true,
      signupPaid: true,
      signUpReference: detection.reference,
      signupGateway: detection.provider,
      signupAmount: detection.amount,
      lastPaymentDate: opts.date
    };
    try { await updateEmergencyProfile(userId, updates); } catch(_){}
  }
}

async function renderPlans(cycle) {
  // Expect a repeater with id `#planRepeater` and elements as described
  const repeater = $w('#planRepeater');
  if (!repeater) return;

  const results = await wixData.query('PlanOptions')
    .ascending('sortOrder')
    .find();

  const useAnnual = (cycle === 'Annual');
  repeater.data = results.items.map(it => {
    const monthlyPrice = Number(it.monthlyPrice || 0);
    const annualPrice = Number(it.annualPrice || 0);
    const annualBaseline = monthlyPrice * 12;
    const savingsAmount = Math.max(0, annualBaseline - annualPrice);
    const savingsPercent = annualBaseline > 0 ? Math.round((savingsAmount / annualBaseline) * 100) : 0;

    const selectedPrice = useAnnual ? annualPrice : monthlyPrice;
    let discountText = '';
    if (useAnnual && savingsPercent >= 5) {
      discountText = `Save ${savingsPercent}%`;
    }

    return {
      _id: it._id,
      productImage: it.productImage,
      planName: it.planName || it.title,
      description: it.description,
      priceDisplay: `${money(selectedPrice)} / ${useAnnual ? 'year (billed annually)' : 'month'}`,
      // dual column support
      monthlyDisplay: `${money(monthlyPrice)} / month`,
      annualDisplay: `${money(annualPrice)} / year (billed annually)`,
      savingsAmount,
      savingsPercent,
      discountText,
      image2: it.image2
    };
  });

  repeater.onItemReady(($item, data) => {
    try { $item('#planImage').src = data.productImage; } catch(_){}
    setText($item('#planName'), data.planName || '');
    setText($item('#planDescription'), data.description || '');
    // Single price (legacy or if only one column present)
    setText($item('#planPrice'), data.priceDisplay || '');

    // Dual column prices if elements exist
    try { setText($item('#monthlyPrice'), data.monthlyDisplay); } catch(_){}
    try { setText($item('#annualPrice'), data.annualDisplay); } catch(_){}
    try { if (data.image2) { $item('#discountBadgeimage').src = data.image2; } } catch(_){}
    if (data.discountText) {
      setText($item('#discountBadge'), data.discountText);
      show($item('#discountBadge'));
      try { show($item('#discountBadgeimage')); } catch(_){}
    } else {
      hide($item('#discountBadge'));
      try { hide($item('#discountBadgeimage')); } catch(_){}
    }

    // Optional explicit savings amount element
    try {
      if (data.savingsAmount > 0) {
        setText($item('#annualSavings'), `Save ${money(data.savingsAmount)} annually`);
        show($item('#annualSavings'));
      } else {
        hide($item('#annualSavings'));
      }
    } catch(_){ }
  });
}

$w.onReady(async () => {
  // Resolve key UI bits with robust discovery
  const CANDIDATES = {
    signUpLink:    ['#signUpLink', '#openSignUp', '#signup', '#btnSignUp', '#openSignup', '#openSignUpButton'],
    subscribeLink: ['#SubscribeLink', '#goToSubscriptionButton', '#subscribe', '#btnSubscribe', '#goToPlans', '#choosePlanButton'],
    visitDashLink: ['#visitDashLink', '#goToDashboardButton', '#dashboard', '#btnDashboard', '#dashboardButton'],
    paySignup:     ['#paySignup', '#paySignUp', '#paySignUpFee', '#paySignupButton'],
    plansBlock:    ['#accordionItem7', '#plansBlock', '#plansAccordion', '#planAccordion', '#plans'],
    billing:       ['#billingCycleDropdown', '#billing', '#billingCycle', '#cycle'],
    subscribeBtn:  ['#subscribe', '#subscribeButton', '#btnSubscribe', '#choosePlan', '#selectPlan'],
    subscribeInfo: ['#subscribeInfo', '#statusText', '#status', '#membersStatus'],
    userText:      ['#User', '#userText', '#welcome', '#greeting'],
    emailText:     ['#Email', '#emailText']
  };
  const TYPE_HINTS = {
    signUpLink: ['Button'], subscribeLink: ['Button'], visitDashLink: ['Button'], paySignup: ['Button'],
    plansBlock: ['Box','Container','Strip','Group','Collapsed'], billing: ['Dropdown','SelectionTags','Text'],
    subscribeBtn: ['Button'], subscribeInfo: ['Text'], userText: ['Text'], emailText: ['Text']
  };
  const TEXT_HINTS = {
    signUpLink: ['sign up','signup'], subscribeLink: ['subscribe','membership','plan'], visitDashLink: ['dashboard','home'],
    paySignup: ['pay sign','sign up fee','pay signup'], plansBlock: ['plans','pricing'],
    billing: ['billing','cycle','monthly','annual'], subscribeBtn: ['subscribe','choose','select'],
    subscribeInfo: ['status','signup','membership'], userText: ['good','welcome','hello'], emailText: ['@','email']
  };
  const used = new Set();
  const resolve = (key) => pick(
    CANDIDATES[key],
    () => findByText(TYPE_HINTS[key], TEXT_HINTS[key], used) || findByIdSubstring(TEXT_HINTS[key], used),
    used
  );
  const UI = {
    userText: resolve('userText'),
    emailText: resolve('emailText'),
    signUpLink: resolve('signUpLink'),
    subscribeLink: resolve('subscribeLink'),
    visitDashLink: resolve('visitDashLink'),
    paySignup: resolve('paySignup'),
    plansBlock: resolve('plansBlock'),
    billing: resolve('billing'),
    subscribeBtn: resolve('subscribeBtn'),
    subscribeInfo: resolve('subscribeInfo')
  };

  // quick audit to console
  Object.entries(UI).forEach(([k, v]) => {
    console.log(v.el ? `✓ resolved ${k} -> ${v.sel}${v.via?` (${v.via})`:''}` : `✗ missing ${k}`);
  });

  // Send backend Discord audit snapshot (best effort, non-blocking)
  try {
    const userForAudit = wixUsers.currentUser;
    let auditEmail = '';
    try { if (userForAudit?.loggedIn) auditEmail = await userForAudit.getEmail(); } catch (_){ }
    const resolved = Object.entries(UI)
      .filter(([_, v]) => !!v.el)
      .map(([key, v]) => ({ key, sel: v.sel, via: v.via }));
    const missing = Object.entries(UI)
      .filter(([_, v]) => !v.el)
      .map(([key]) => key);
    await logMembershipSignupAudit(userForAudit?.id || 'guest', auditEmail, 'Membership Signup', { resolved, missing });
  } catch (_){ }

  // User context
  const user = wixUsers.currentUser;
  if (!user || !user.loggedIn) {
    UI.userText.el && setText(UI.userText.el, 'Please log in to continue');
    UI.emailText.el && setText(UI.emailText.el, '');
    [UI.signUpLink.el, UI.subscribeLink.el, UI.visitDashLink.el, UI.paySignup.el].forEach(el => el && hide(el));
    return;
  }

  let email = '';
  try { email = await user.getEmail(); } catch(_){}
  const profile = await getEmergencyProfile(user.id).catch(() => null);
  const name = (profile?.fullName && profile.fullName.trim()) || (email ? email.split('@')[0] : 'Member');
  UI.userText.el && setText(UI.userText.el, `${greet()} ${name}`);
  UI.emailText.el && setText(UI.emailText.el, email || '');

  // Determine sign-up and subscription status (PayFast + Paystack + CMS)
  const agg = await getUserPaymentStatus(user.id, email).catch(() => ({}));
  const detection = await detectSignupPayment(user.id, email).catch(() => ({}));
  const signupPaid = !!(agg?.hasSignUpPaid || detection?.paymentDetected);
  const signupAmount = agg?.signupAmount || detection?.amount || 150;
  const signupDate = agg?.signupDate || detection?.paymentDate || new Date();
  const hasSub = !!(agg?.hasSubscription);

  // If detection found proof, ensure CMS reflects it
  if (detection?.paymentDetected) { await ensureCmsSignup(user.id, detection); }

  // a) signUpLink behavior
  if (!signupPaid) {
    if (UI.signUpLink.el) { setLabel(UI.signUpLink.el, 'Complete Sign Up'); show(UI.signUpLink.el); setEnabled(UI.signUpLink.el, true); onClick(UI.signUpLink.el, () => openSignup(user.id, email)); }
  } else {
    if (UI.signUpLink.el) { setLabel(UI.signUpLink.el, `Sign Up fee: ${money(signupAmount)} was paid on ${dateStr(signupDate)}`); setEnabled(UI.signUpLink.el, false); show(UI.signUpLink.el); }
  }

  // paySignup button in top accordion block
  if (!signupPaid) {
    if (UI.paySignup.el) { setLabel(UI.paySignup.el, 'Pay Sign Up Fee'); show(UI.paySignup.el); setEnabled(UI.paySignup.el, true); onClick(UI.paySignup.el, () => openSignup(user.id, email)); }
  } else {
    if (UI.paySignup.el) { setLabel(UI.paySignup.el, 'SIGNUP PAID'); setEnabled(UI.paySignup.el, false); show(UI.paySignup.el); }
  }

  // Middle block subscribe button
  if (UI.subscribeBtn.el) {
    if (!signupPaid) {
      hide(UI.subscribeBtn.el);
      if (UI.subscribeInfo.el) { setText(UI.subscribeInfo.el, 'Please sign up'); show(UI.subscribeInfo.el); }
    } else {
      show(UI.subscribeBtn.el);
      onClick(UI.subscribeBtn.el, async () => { if (UI.plansBlock.el) await expandOrShow(UI.plansBlock.el); });
      if (UI.subscribeInfo.el) hide(UI.subscribeInfo.el);
    }
  }

  // SubscribeLink (if also present)
  if (UI.subscribeLink.el) {
    if (signupPaid && !hasSub) {
      setLabel(UI.subscribeLink.el, 'Subscribe to a Plan'); show(UI.subscribeLink.el); setEnabled(UI.subscribeLink.el, true);
      onClick(UI.subscribeLink.el, async () => { if (UI.plansBlock.el) await expandOrShow(UI.plansBlock.el); });
    } else {
      hide(UI.subscribeLink.el);
    }
  }

  // Dashboard link visible only when subscribed
  if (UI.visitDashLink.el) { if (hasSub) { show(UI.visitDashLink.el); onClick(UI.visitDashLink.el, () => wixLocation.to('/dashboard')); } else { hide(UI.visitDashLink.el); } }

  // Plans rendering + billing cycle toggle
  const billingEl = UI.billing.el;
  const initialCycle = billingEl && billingEl.value ? billingEl.value : 'Monthly';
  await renderPlans(initialCycle);
  if (billingEl) { billingEl.onChange(async () => { await renderPlans(billingEl.value || 'Monthly'); }); }
});
