// membersignup page logic
// Adds greeting, email display, signup/subscription gating, and plan rendering with logging

import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import wixData from 'wix-data';

import { getUserPaymentStatus } from 'backend/status.jsw';
import { detectSignupPayment, detectActiveSubscription } from 'backend/core/payment-service.jsw';
import { getEmergencyProfile, updateEmergencyProfile } from 'backend/core/profile-service.jsw';
import { sendDiscordLog } from 'backend/logger.jsw';

const log = async (m, extra = null) => {
  try { console.log(m, extra ?? ''); await sendDiscordLog(m + (extra ? ` ${JSON.stringify(extra)}` : '')); } catch (_) {}
};

const tryGet = (sel) => { try { const el = $w(sel); el.id; return el; } catch (_) { return null; } };
const getEl = (id, alts = []) => {
  const candidates = ['#' + id.replace(/^#/, '')].concat(alts.map(a => '#' + a.replace(/^#/, '')));
  for (const c of candidates) { const el = tryGet(c); if (el) return el; }
  try {
    const wanted = candidates.map(s => s.replace(/^#/, '').toLowerCase());
    const all = $w('*');
    for (const el of all) { try { const nid = (el.id || '').toLowerCase(); if (wanted.includes(nid)) return el; } catch(_){} }
    for (const el of all) { try { const nid = (el.id || '').toLowerCase(); if (wanted.some(w => nid.includes(w))) return el; } catch(_){} }
  } catch(_){}
  return null;
};
const safeShow = (el) => { try { el.show(); } catch (_) {} };
const safeHide = (el) => { try { el.hide(); } catch (_) {} };
const safeText = (el, t) => { try { el.text = String(t); } catch (_) {} };
const safeLabel = (el, t) => { try { el.label = String(t); } catch (_) { safeText(el, t); } };
const safeDisable = (el, v=true) => { try { el.enabled = !v; } catch (_) {} };
const safeOnClick = (el, fn) => { try { el.onClick(fn); } catch (_) {} };
const safeExpand = async (el) => { try { if (el.expand) await el.expand(); else await el.show(); } catch (_) { try { await el.show(); } catch {} } };

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : (h < 17 ? 'Good Afternoon' : 'Good Evening'); };
const fmtMoney = (n) => `R ${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(); } catch { return ''; } };

// UX preference: when signup is unpaid, either hide SubscribeLink or show a disabled informative message
const HIDE_SUBSCRIBE_WHEN_UNPAID = true;


// UX preference: when signup is unpaid, either hide SubscribeLink or show a disabled informative message

// Helper: open the signup lightbox using the new name, fallback to old name
async function openSignupLightbox() {
  try {
    await wixWindow.openLightbox('CollectAddresses');
  } catch (e) {
    try { await wixWindow.openLightbox('CollectAddresses1'); } catch (_) {}
  }
} // set to false to keep it visible but disabled with a helpful label

async function ensureCmsFromDetection(userId, email, detection) {
  if (!detection?.paymentDetected) return;
  try {
    const profile = await getEmergencyProfile(userId).catch(() => null);
    const already = profile?.signUpPaid === true || profile?.signupPaid === true;
    if (already) { await log('ℹ️ CMS already marked signUpPaid'); return; }
    const updates = {
      signUpPaid: true,
      signupPaid: true,
      signUpReference: detection.reference || profile?.signUpReference || null,
      signupGateway: detection.provider || profile?.signupGateway || null,
      signupAmount: detection.amount || profile?.signupAmount || 150,
      lastPaymentDate: detection.paymentDate ? new Date(detection.paymentDate) : new Date()
    };
    await updateEmergencyProfile(userId, updates);
    await log('✅ CMS updated from detection', updates);
  } catch (e) {
    await log('❌ ensureCmsFromDetection failed', { error: e?.message || String(e) });
  }
}

async function detectSignup(userId, email) {
  const detection = await detectSignupPayment(userId, email).catch((e) => ({ success:false, error:e?.message }));
  await log('🔎 detectSignup result', detection);
  await ensureCmsFromDetection(userId, email, detection);
  return detection;
}

async function findPlansRepeater() {
  try {
    const all = $w('*');
    for (const el of all) {
      try { if (typeof el.onItemReady === 'function' && typeof el.forEachItem === 'function') return el; } catch(_){}
    }
  } catch(_){}
  return null;
}

async function renderPlans(cycle) {
  const repeater = await findPlansRepeater();
  if (!repeater) { await log('⚠️ No repeater found for plans'); return; }

  const res = await wixData.query('PlanOptions').ascending('sortOrder').find().catch((e) => ({ items: [], error:e?.message }));
  if (!res.items) { await log('❌ PlanOptions query failed', res); return; }

  const useAnnual = (cycle || '').toLowerCase().startsWith('a');
  const items = res.items.map((it) => {
    const monthly = Number(it.monthlyPrice || 0);
    const annual = Number(it.annualPrice || 0);
    const price = useAnnual ? annual : monthly;
    let discountText = '';
    if (useAnnual && monthly > 0 && annual > 0) {
      const yearlyIfMonthly = monthly * 12;
      const save = Math.max(0, (yearlyIfMonthly - annual));
      const pct = yearlyIfMonthly > 0 ? Math.round((save / yearlyIfMonthly) * 100) : 0;
      if (pct >= 5) discountText = `Save ${pct}%`;
    }
    return {
      _id: it._id,
      productImage: it.productImage,
      planName: it.planName,
      description: it.description,
      priceDisplay: useAnnual ? `${fmtMoney(price)} / year` : `${fmtMoney(price)} / month`,
      discountText,
    };
  });

  repeater.data = items;
  repeater.onItemReady(($item, data) => {
    const img = $item('#planImage');
    const name = $item('#planName');
    const desc = $item('#planDescription');
    const badge = $item('#discountBadge');
    const price = $item('#planPrice');
    if (img) { try { img.src = data.productImage; } catch(_){} }
    if (name) safeText(name, data.planName || '');
    if (desc) safeText(desc, data.description || '');
    if (price) safeText(price, data.priceDisplay || '');
    if (badge) { if (data.discountText) { safeText(badge, data.discountText); safeShow(badge); } else { safeHide(badge); } }
  });
  await log('✅ Plans rendered', { count: items.length, cycle });
}

$w.onReady(async () => {
  await log('🚀 membersignup: onReady start');

  // Elements (use tolerant resolver for alternate spellings/locations)
  const elUser = getEl('User');
  const elEmail = getEl('Email');
  const elSignUpLink = getEl('signUpLink');
  const elSubscribeLink = getEl('SubscribeLink');
  const elVisitDash = getEl('visitDashLink');
  const elPaySignup = getEl('paySignup');
  const elAccordionTop = getEl('accordionItem3');
  const elAccordionMiddle = getEl('accordian1', ['accordion1']);
  const elAccordionPlans = getEl('accordionItem7');
  const elBilling = getEl('billingCycleDropdown');
  const elSubscribeBtn = getEl('subscribe');
  const elSubscribeInfo = getEl('subscribeInfo');

  // User context
  const user = wixUsers.currentUser;
  if (!user?.loggedIn) {
    await log('⚠️ Not logged in - show minimal UI');
    safeText(elUser, 'Please log in to continue');
    safeText(elEmail, '');
    safeHide(elSignUpLink); safeHide(elSubscribeLink); safeHide(elVisitDash); safeHide(elPaySignup);
    return;
  }

  let email = '';
  try { email = await user.getEmail(); } catch(e) { await log('⚠️ getEmail failed', { error: e?.message }); }
  const profile = await getEmergencyProfile(user.id).catch(() => null);
  const name = profile?.fullName?.trim() || (email ? email.split('@')[0] : 'Member');
  safeText(elUser, `${greet()} ${name}`);
  safeText(elEmail, email || '');
  await log('👤 user resolved', { userId: user.id, name, email });

  // Determine payment + subscription
  const [agg, detection] = await Promise.all([
    getUserPaymentStatus(user.id, email).catch((e) => ({ error:e?.message })),
    detectSignup(user.id, email)
  ]);
  await log('📊 aggregate status', agg);

  const signupPaid = !!(agg?.hasSignUpPaid || detection?.paymentDetected);
  const signupAmount = agg?.signupAmount || detection?.amount || 150;
  const signupDate = agg?.signupDate || detection?.paymentDate || new Date();
  const hasSub = !!(agg?.hasSubscription);

  // signUpLink + paySignup buttons
  if (!signupPaid) {
    if (elSignUpLink) {
      safeLabel(elSignUpLink, 'Complete Sign Up'); safeShow(elSignUpLink); safeDisable(elSignUpLink, false);
      safeOnClick(elSignUpLink, () => openSignupLightbox());
      await log('🔗 signUpLink enabled for unpaid');
    }
    if (elPaySignup) {
      safeLabel(elPaySignup, 'Pay Sign Up Fee'); safeShow(elPaySignup); safeDisable(elPaySignup, false);
      safeOnClick(elPaySignup, () => openSignupLightbox());
      await log('🔘 paySignup enabled for unpaid');
    }
  } else {
    if (elSignUpLink) {
      safeLabel(elSignUpLink, `Sign Up fee: ${fmtMoney(signupAmount)} was paid on ${fmtDate(signupDate)}`);
      safeDisable(elSignUpLink, true); safeShow(elSignUpLink);
      await log('✅ signUpLink shows paid summary');
    }
    if (elPaySignup) { safeLabel(elPaySignup, 'SIGNUP PAID'); safeDisable(elPaySignup, true); safeShow(elPaySignup); }
  }

  // Subscribe links/buttons
  if (elSubscribeLink) {
    if (signupPaid && !hasSub) {
      safeLabel(elSubscribeLink, 'Subscribe to a Plan');
      safeShow(elSubscribeLink);
      safeDisable(elSubscribeLink, false);
      safeOnClick(elSubscribeLink, async () => { if (elAccordionPlans) await safeExpand(elAccordionPlans); });
      await log('🟢 SubscribeLink enabled (signup paid, no subscription)');
    } else if (!signupPaid) {
      if (HIDE_SUBSCRIBE_WHEN_UNPAID) {
        safeHide(elSubscribeLink);
        await log('🔒 SubscribeLink hidden (signup unpaid)');
      } else {
        safeLabel(elSubscribeLink, 'Please pay the sign-up fee before selecting a subscription plan');
        safeShow(elSubscribeLink);
        safeDisable(elSubscribeLink, true);
        await log('🔒 SubscribeLink disabled with unpaid notice');
      }
    } else {
      // signupPaid && hasSub
      safeHide(elSubscribeLink);
    }
  }

  if (elSubscribeBtn) {
    if (signupPaid) { safeShow(elSubscribeBtn); safeOnClick(elSubscribeBtn, async () => { if (elAccordionPlans) await safeExpand(elAccordionPlans); }); }
    else { safeHide(elSubscribeBtn); }
  }

  // Dashboard link
  if (elVisitDash) {
    if (hasSub) { safeShow(elVisitDash); safeOnClick(elVisitDash, () => wixLocation.to('/dashboard')); }
    else { safeHide(elVisitDash); }
  }

  // Informative subscription message (best practice): guide when signup unpaid
  if (elSubscribeInfo) {
    if (!signupPaid) {
      safeText(elSubscribeInfo, 'Complete your once-off sign-up payment to choose a plan.');
      safeShow(elSubscribeInfo);
      // Make it actionable: open the data collection lightbox
      safeOnClick(elSubscribeInfo, () => wixWindow.openLightbox('CollectAddresses'));
    } else {
      safeHide(elSubscribeInfo);
    }
  }

  // Plans
  const cycle = (elBilling && elBilling.value) || 'Monthly';
  await renderPlans(cycle);
  if (elBilling) { elBilling.onChange(async () => { await renderPlans(elBilling.value || 'Monthly'); }); }

  await log('✅ membersignup: initialized');
});

