// pages/membersignup.js
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import wixData from 'wix-data';
import wixWindow from 'wix-window';

import { getUserPaymentStatus } from 'backend/status.jsw';
import { PaymentService } from 'backend/core/payment-service.jsw';
import { getEmergencyProfile, updateEmergencyProfile } from 'backend/core/profile-service.jsw';
import { sendDiscordLog } from 'backend/logger.jsw';

const getEl = (sel) => { try { const el = $w(sel); el.id; return el; } catch (_) { return null; } };
const safeShow = (el) => { try { el.show(); } catch (_) {} };
const safeHide = (el) => { try { el.hide(); } catch (_) {} };
const safeText = (el, t) => { try { el.text = String(t); } catch (_) {} };
const safeLabel = (el, t) => { try { el.label = String(t); } catch (_) { safeText(el, t); } };
const safeDisable = (el, v=true) => { try { el.enabled = !v; } catch (_) {} };
const safeOnClick = (el, fn) => { try { el.onClick(fn); } catch (_) {} };
const safeExpand = async (el) => { try { if (el.expand) await el.expand(); else await el.show(); } catch (_) { try { await el.show(); } catch {} } };

function greetingPrefix() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatZAR(amount) {
  const n = Number(amount || 0);
  return `R ${n.toFixed(2)}`;
}

function formatDate(d) {
  try { return new Date(d).toLocaleDateString(); } catch { return ''; }
}

async function ensureCmsFromDetection(userId, email, detection) {
  try {
    if (!detection?.paymentDetected) return;
    const profile = await getEmergencyProfile(userId);
    const already = profile?.signUpPaid === true || profile?.signupPaid === true;
    if (already) return;
    const updates = {
      signUpPaid: true,
      signupPaid: true,
      signUpReference: detection.reference || profile?.signUpReference || null,
      signupGateway: detection.provider || profile?.signupGateway || null,
      signupAmount: detection.amount || profile?.signupAmount || 150,
      lastPaymentDate: detection.paymentDate ? new Date(detection.paymentDate) : new Date()
    };
    await updateEmergencyProfile(userId, updates);
  } catch (e) {
    console.warn('[membersignup] ensureCmsFromDetection failed:', e?.message || e);
  }
}

async function detectSignup(userId, email) {
  // Use robust detector that checks CMS, our collections, and Paystack API; PayFast evidence is in CMS/ITN collection
  const detection = await PaymentService.detectSignupPayment(userId, email).catch(() => ({ success:false }));
  await ensureCmsFromDetection(userId, email, detection);
  return detection;
}

async function renderPlans(cycle) {
  // Pick first repeater on the page (assumes only one on membersignup)
  const repeaters = /** @type {any[]} */ ($w('Repeater'));
  const repeater = repeaters && repeaters.length ? repeaters[0] : null;
  if (!repeater) return;

  const res = await wixData.query('PlanOptions').ascending('sortOrder').find().catch(() => ({ items: [] }));
  const items = (res.items || []).map((it) => {
    const monthly = Number(it.monthlyPrice || 0);
    const annual = Number(it.annualPrice || 0);
    const useAnnual = (cycle || '').toLowerCase().startsWith('a');
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
      priceDisplay: useAnnual ? `${formatZAR(price)} / year` : `${formatZAR(price)} / month`,
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
    if (badge) {
      if (data.discountText) { safeText(badge, data.discountText); safeShow(badge); }
      else { safeHide(badge); }
    }
  });
}

$w.onReady(async () => {
  try { await sendDiscordLog('🚀 membersignup: page booting'); } catch {}

  const elUser = getEl('#User');
  const elEmail = getEl('#Email');
  const elSignUpLink = getEl('#signUpLink');
  const elSubscribeLink = getEl('#SubscribeLink');
  const elVisitDash = getEl('#visitDashLink');
  const elPaySignup = getEl('#paySignup');
  const elAccordionTop = getEl('#accordionItem3');
  const elAccordionMiddle = getEl('#accordian1'); // note: provided spelling
  const elAccordionPlans = getEl('#accordionItem7');
  const elBilling = getEl('#billingCycleDropdown');
  const elSubscribeBtn = getEl('#subscribe');

  // User context
  const user = wixUsers.currentUser;
  if (!user?.loggedIn) {
    safeText(elUser, 'Please log in to continue');
    safeText(elEmail, '');
    return;
  }

  let email = '';
  try { email = await user.getEmail(); } catch {}
  const profile = await getEmergencyProfile(user.id).catch(() => null);
  const name = profile?.fullName?.trim() || (email ? email.split('@')[0] : 'Member');
  safeText(elUser, `${greetingPrefix()} ${name}`);
  safeText(elEmail, email || '');

  // Determine payment and subscription status (robust detector + aggregator)
  const [agg, detect] = await Promise.all([
    getUserPaymentStatus(user.id, email).catch(() => null),
    detectSignup(user.id, email)
  ]);

  const signupPaid = !!(agg?.hasSignUpPaid || detect?.paymentDetected);
  const signupAmount = agg?.signupAmount || detect?.amount || null;
  const signupDate = agg?.signupDate || detect?.paymentDate || null;
  const hasSub = !!(agg?.hasSubscription);

  // signUpLink logic
  if (!signupPaid) {
    if (elSignUpLink) {
      safeLabel(elSignUpLink, 'Complete Sign Up');
      safeShow(elSignUpLink);
      safeDisable(elSignUpLink, false);
      safeOnClick(elSignUpLink, () => wixWindow.openLightbox('CollectAddresses1'));
    }
    if (elPaySignup) {
      safeLabel(elPaySignup, 'Pay Sign Up Fee');
      safeShow(elPaySignup);
      safeDisable(elPaySignup, false);
      safeOnClick(elPaySignup, () => wixWindow.openLightbox('CollectAddresses1'));
    }
  } else {
    if (elSignUpLink) {
      const paidLine = `Sign Up fee: ${formatZAR(signupAmount || 150)} was paid on ${formatDate(signupDate)}`;
      safeLabel(elSignUpLink, paidLine);
      safeDisable(elSignUpLink, true);
      safeShow(elSignUpLink);
    }
    if (elPaySignup) {
      safeLabel(elPaySignup, 'SIGNUP PAID');
      safeDisable(elPaySignup, true);
      safeShow(elPaySignup);
    }
  }

  // Subscribe link and button
  if (elSubscribeLink) {
    if (signupPaid && !hasSub) {
      safeLabel(elSubscribeLink, 'Subscribe to a Plan');
      safeShow(elSubscribeLink);
      safeOnClick(elSubscribeLink, async () => {
        if (elAccordionPlans) await safeExpand(elAccordionPlans);
        try { wixWindow.scrollTo(0, elAccordionPlans ? elAccordionPlans.y : 0); } catch {}
      });
    } else if (!signupPaid) {
      safeLabel(elSubscribeLink, 'Please sign up');
      safeShow(elSubscribeLink);
      safeDisable(elSubscribeLink, true);
    } else {
      safeHide(elSubscribeLink);
    }
  }

  if (elSubscribeBtn) {
    if (signupPaid) {
      safeShow(elSubscribeBtn);
      safeOnClick(elSubscribeBtn, async () => {
        if (elAccordionPlans) await safeExpand(elAccordionPlans);
      });
    } else {
      safeHide(elSubscribeBtn);
    }
  }

  // Dashboard link
  if (elVisitDash) {
    if (hasSub) {
      safeShow(elVisitDash);
      safeOnClick(elVisitDash, () => wixLocation.to('/dashboard'));
    } else {
      safeHide(elVisitDash);
    }
  }

  // Plans rendering + billing cycle toggle
  const cycle = (elBilling && elBilling.value) || 'Monthly';
  await renderPlans(cycle);
  if (elBilling) {
    elBilling.onChange(async () => {
      await renderPlans(elBilling.value || 'Monthly');
    });
  }

  try { await sendDiscordLog('✅ membersignup: page initialized'); } catch {}
});

